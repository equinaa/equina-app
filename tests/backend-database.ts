import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

// A Postgres with the parts of Supabase the migrations rely on, and every
// migration in supabase/migrations applied in order.
export const openBackendDatabase = async () => {
  const db = new PGlite({ extensions: { citext, pgcrypto } });

  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema extensions;
    create schema auth;
    create schema storage;
    grant usage on schema storage to anon, authenticated;
    create extension pgcrypto with schema extensions;
    create extension citext with schema extensions;

    create table auth.users (
      id uuid primary key default gen_random_uuid(),
      email text,
      -- Null until the person confirms the address; the beta door reads it.
      email_confirmed_at timestamptz,
      raw_user_meta_data jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );

    create or replace function auth.uid()
    returns uuid language sql stable set search_path = '' as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    -- The session's claims as PostgREST hands them over. Tests set only what a
    -- policy reads, e.g. {"aal":"aal2"} for a session with a verified second
    -- factor.
    create or replace function auth.jwt()
    returns jsonb language sql stable set search_path = '' as $$
      select nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    grant execute on function auth.jwt() to anon, authenticated;

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
    grant select, insert, update, delete on storage.objects to authenticated;
    grant select on storage.objects to anon;

    create or replace function storage.foldername(name text)
    returns text[] language sql immutable set search_path = '' as $$
      select string_to_array(trim(both '/' from name), '/');
    $$;

    create publication supabase_realtime;

    -- Hosted Supabase gives anon, authenticated and service_role every privilege
    -- on whatever is created in public. Without this the harness tests a database
    -- that never existed: a grant a migration forgot to revoke would be missing
    -- here and present in production.
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  `);

  const migrationsDirectory = join(process.cwd(), "supabase", "migrations");
  for (const fileName of readdirSync(migrationsDirectory).filter((name) => name.endsWith(".sql")).sort()) {
    const sql = readFileSync(join(migrationsDirectory, fileName), "utf8");
    try {
      await db.exec(sql);
    } catch (error) {
      throw new Error(`Migration ${fileName} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return db;
};
