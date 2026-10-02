import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

type Finding = Record<string, unknown>;

const db = new PGlite({ extensions: { citext, pgcrypto } });

await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role bypassrls;
  create schema extensions;
  create schema auth;
  create schema storage;
  create extension pgcrypto with schema extensions;
  create extension citext with schema extensions;

  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
  );

  create or replace function auth.uid()
  returns uuid language sql stable set search_path = '' as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
  $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;

  create table storage.buckets (
    id text primary key,
    name text not null unique,
    public boolean not null default false,
    file_size_limit bigint,
    allowed_mime_types text[]
  );

  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text not null references storage.buckets(id) on delete cascade,
    name text not null,
    owner_id text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    unique (bucket_id, name)
  );
  alter table storage.objects enable row level security;

  create or replace function storage.foldername(name text)
  returns text[] language sql immutable set search_path = '' as $$
    select string_to_array(trim(both '/' from name), '/');
  $$;

  create publication supabase_realtime;

  -- Hosted Supabase gives anon, authenticated and service_role every privilege
  -- on whatever is created in public. Auditing without it reports on a
  -- database that never existed.
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`);

const migrationsDirectory = join(process.cwd(), "supabase", "migrations");
const migrationFiles = readdirSync(migrationsDirectory)
  .filter((name) => name.endsWith(".sql"))
  .sort();

for (const fileName of migrationFiles) {
  await db.exec(readFileSync(join(migrationsDirectory, fileName), "utf8"));
}

const query = async <T extends Finding>(sql: string) => (await db.query<T>(sql)).rows;

const missingRls = await query<{ table_name: string }>(`
  select c.relname as table_name
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and not c.relrowsecurity
  order by c.relname
`);

const missingPrimaryKeys = await query<{ table_name: string }>(`
  select c.relname as table_name
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and not exists (
      select 1
      from pg_constraint k
      where k.conrelid = c.oid and k.contype = 'p'
    )
  order by c.relname
`);

// Every non-SELECT privilege a client role holds on a public table, whether
// granted on the whole table or on some of its columns.
const clientWriteGrants = await query<{
  role: string;
  table_name: string;
  privilege_type: string;
  table_level: boolean;
}>(`
  select r.role, c.relname as table_name, p.privilege as privilege_type, true as table_level
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join (values ('anon'), ('authenticated')) r(role)
  cross join (values ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')) p(privilege)
  where n.nspname = 'public' and c.relkind = 'r'
    and has_table_privilege(r.role, c.oid, p.privilege)
  union all
  select r.role, c.relname, p.privilege, false
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join (values ('anon'), ('authenticated')) r(role)
  cross join (values ('INSERT'), ('UPDATE'), ('REFERENCES')) p(privilege)
  where n.nspname = 'public' and c.relkind = 'r'
    and not has_table_privilege(r.role, c.oid, p.privilege)
    and has_any_column_privilege(r.role, c.oid, p.privilege)
  order by 1, 2, 3
`);

const anonMutationGrants = clientWriteGrants.filter((grant) => grant.role === "anon");

// TRUNCATE ignores RLS; the others are DDL no client should run.
const clientRlsBypassGrants = clientWriteGrants.filter(
  (grant) => grant.role === "authenticated" && ["TRUNCATE", "REFERENCES", "TRIGGER", "MAINTAIN"].includes(grant.privilege_type)
);

// A table-level INSERT or UPDATE lets a client write every column a policy
// lets through, server-owned ones included. Only staff-gated tables keep one.
const staffManagedWrites = new Set([
  ...["academy_chapters", "academy_lessons", "app_feature_flags", "coach_credit_policies", "listing_risk_signals", "moderation_actions"]
    .flatMap((table) => [`${table}:INSERT`, `${table}:UPDATE`]),
  "content_reports:UPDATE",
  "marketplace_reports:UPDATE",
  "user_sanctions:UPDATE"
]);
const clientTableWrites = clientWriteGrants.filter(
  (grant) =>
    grant.role === "authenticated" &&
    grant.table_level &&
    ["INSERT", "UPDATE"].includes(grant.privilege_type) &&
    !staffManagedWrites.has(`${grant.table_name}:${grant.privilege_type}`)
);

const clientMediaMutationGrants = clientWriteGrants.filter(
  (grant) =>
    grant.role === "authenticated" &&
    ["horse_record_files", "club_post_media", "listing_photos", "dispute_evidence"].includes(grant.table_name) &&
    ["INSERT", "UPDATE", "DELETE"].includes(grant.privilege_type)
);

const clientSequenceGrants = await query<{ sequence_name: string }>(`
  select c.relname as sequence_name
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'S'
    and (
      has_sequence_privilege('anon', c.oid, 'USAGE, UPDATE')
      or has_sequence_privilege('authenticated', c.oid, 'USAGE, UPDATE')
    )
  order by c.relname
`);

const directStorageWritePolicies = await query<{
  policy_name: string;
  command: string;
  roles: string;
}>(`
  select policyname as policy_name, cmd as command, array_to_string(roles, ',') as roles
  from pg_policies
  where schemaname = 'storage'
    and tablename = 'objects'
    and cmd in ('ALL', 'INSERT', 'UPDATE', 'DELETE')
    and (
      'public' = any(roles)
      or 'anon' = any(roles)
      or 'authenticated' = any(roles)
    )
  order by policyname
`);

const clientServerOwnedColumns = await query<{
  table_name: string;
  column_name: string;
  privilege_type: string;
}>(`
  select table_name, column_name, privilege_type
  from information_schema.column_privileges
  where table_schema = 'public'
    and grantee = 'authenticated'
    and privilege_type in ('INSERT', 'UPDATE')
    and (
      (table_name = 'profiles' and column_name in ('avatar_path', 'onboarding_completed_at'))
      or (table_name = 'horses' and column_name = 'photo_path')
    )
  order by table_name, column_name, privilege_type
`);

const unsafeDefiners = await query<{
  schema_name: string;
  function_name: string;
  arguments: string;
}>(`
  select
    n.nspname as schema_name,
    p.proname as function_name,
    pg_get_function_identity_arguments(p.oid) as arguments
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private')
    and p.prosecdef
    and not exists (
      select 1
      from unnest(coalesce(p.proconfig, '{}'::text[])) setting
      where setting like 'search_path=%'
    )
  order by n.nspname, p.proname, arguments
`);

const executableDefiners = await query<{
  schema_name: string;
  function_name: string;
  arguments: string;
  anon_execute: boolean;
  authenticated_execute: boolean;
}>(`
  select
    n.nspname as schema_name,
    p.proname as function_name,
    pg_get_function_identity_arguments(p.oid) as arguments,
    (
      has_schema_privilege('anon', n.oid, 'USAGE')
      and has_function_privilege('anon', p.oid, 'EXECUTE')
    ) as anon_execute,
    (
      has_schema_privilege('authenticated', n.oid, 'USAGE')
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')
    ) as authenticated_execute
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private')
    and p.prosecdef
    and (
      (
        has_schema_privilege('anon', n.oid, 'USAGE')
        and has_function_privilege('anon', p.oid, 'EXECUTE')
      )
      or (
        has_schema_privilege('authenticated', n.oid, 'USAGE')
        and has_function_privilege('authenticated', p.oid, 'EXECUTE')
      )
    )
  order by n.nspname, p.proname, arguments
`);

const unexpectedAnonDefiners = executableDefiners.filter(
  (entry) =>
    entry.anon_execute &&
    !(
      entry.schema_name === "public" &&
      entry.function_name === "get_seller_public_profile" &&
      entry.arguments === "target_user_id uuid"
    )
);

const unindexedForeignKeys = await query<{
  table_name: string;
  constraint_name: string;
  columns: string;
}>(`
  select
    rel.relname as table_name,
    con.conname as constraint_name,
    array_to_string(array(
      select att.attname
      from unnest(con.conkey) with ordinality as key(attnum, position)
      join pg_attribute att
        on att.attrelid = con.conrelid and att.attnum = key.attnum
      order by key.position
    ), ', ') as columns
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace n on n.oid = rel.relnamespace
  where con.contype = 'f'
    and n.nspname = 'public'
    and not exists (
      select 1
      from pg_index idx
      where idx.indrelid = con.conrelid
        and idx.indisvalid
        and con.conkey <@ (idx.indkey::smallint[])
    )
  order by rel.relname, con.conname
`);

const publicBuckets = await query<{ id: string }>(`
  select id from storage.buckets where public order by id
`);

const realtimeTables = await query<{ table_name: string }>(`
  select c.relname as table_name
  from pg_publication_rel pr
  join pg_publication p on p.oid = pr.prpubid
  join pg_class c on c.oid = pr.prrelid
  join pg_namespace n on n.oid = c.relnamespace
  where p.pubname = 'supabase_realtime' and n.nspname = 'public'
  order by c.relname
`);

const report = {
  migrations: migrationFiles.length,
  critical: {
    missingRls,
    missingPrimaryKeys,
    anonMutationGrants,
    clientTableWrites,
    clientRlsBypassGrants,
    clientSequenceGrants,
    clientMediaMutationGrants,
    directStorageWritePolicies,
    clientServerOwnedColumns,
    unsafeDefiners,
    unexpectedAnonDefiners
  },
  review: {
    executableDefiners,
    unindexedForeignKeys,
    publicBuckets,
    realtimeTables
  }
};

console.log(JSON.stringify(report, null, 2));

await db.close();

if (
  missingRls.length ||
  missingPrimaryKeys.length ||
  anonMutationGrants.length ||
  clientTableWrites.length ||
  clientRlsBypassGrants.length ||
  clientSequenceGrants.length ||
  clientMediaMutationGrants.length ||
  directStorageWritePolicies.length ||
  clientServerOwnedColumns.length ||
  unsafeDefiners.length ||
  unexpectedAnonDefiners.length
) {
  process.exitCode = 1;
}
