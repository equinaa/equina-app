import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

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
  grant select, insert, update, delete on storage.objects to authenticated;
  grant select on storage.objects to anon;

  create or replace function storage.foldername(name text)
  returns text[] language sql immutable set search_path = '' as $$
    select string_to_array(trim(both '/' from name), '/');
  $$;

  create publication supabase_realtime;
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

const tableCount = await db.query<{ count: number }>(`
  select count(*)::int as count from information_schema.tables
  where table_schema = 'public' and table_type = 'BASE TABLE'
`);
assert.ok((tableCount.rows[0]?.count ?? 0) >= 35, "Expected all backend tables to be created.");

const missingRls = await db.query<{ tablename: string }>(`
  select c.relname as tablename
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
`);
assert.deepEqual(missingRls.rows, [], `All public backend tables need RLS: ${missingRls.rows.map((row) => row.tablename).join(", ")}`);

const seededFlags = await db.query<{ enabled: boolean; rollout_percent: number }>("select enabled, rollout_percent from public.app_feature_flags");
assert.equal(seededFlags.rows.length, 11);
assert.ok(seededFlags.rows.every((flag) => !flag.enabled && flag.rollout_percent === 0));

const riderA = "10000000-0000-4000-8000-000000000001";
const riderB = "10000000-0000-4000-8000-000000000002";
const riderC = "10000000-0000-4000-8000-000000000003";
await db.exec(`
  insert into auth.users(id, email, raw_user_meta_data) values
    ('${riderA}', 'seller@equina.test', '{"display_name":"Seller A"}'),
    ('${riderB}', 'rider-b@equina.test', '{"display_name":"Rider B"}'),
    ('${riderC}', 'rider-c@equina.test', '{"display_name":"Rider C"}');
`);

await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${riderA}', false);`);
await assert.rejects(
  db.query(`insert into public.horses(owner_id, name, discipline) values ($1, 'Blocked rollout horse', 'jumping')`, [riderA]),
  /row-level security/,
  "Server-side feature gates must reject mutations while rollout is disabled."
);
await db.exec(`
  reset role;
  insert into public.feature_flag_overrides(user_id, key, enabled, note)
  values
    ('${riderA}', 'horse_management', true, 'Internal test rider'),
    ('${riderA}', 'record_mutations', true, 'Internal test rider');
  set role authenticated;
  select set_config('request.jwt.claim.sub', '${riderA}', false);
`);
const overrideHorse = await db.query<{ id: string }>(`
  insert into public.horses(owner_id, name, discipline)
  values ('${riderA}', 'Internal rollout horse', 'jumping')
  returning id
`);
assert.ok(overrideHorse.rows[0]?.id, "A named internal rider should receive its explicit override.");
await db.exec(`select set_config('request.jwt.claim.sub', '${riderB}', false);`);
await assert.rejects(
  db.query(`insert into public.horses(owner_id, name, discipline) values ($1, 'Other rider horse', 'jumping')`, [riderB]),
  /row-level security/,
  "A named-user override must not enable the feature for another rider."
);
await db.exec(`
  reset role;
  delete from public.horses where id = '${overrideHorse.rows[0]?.id}';
  delete from public.feature_flag_overrides where user_id = '${riderA}';
`);
await db.exec(`reset role; update public.app_feature_flags set enabled = true, rollout_percent = 100;`);
await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${riderA}', false);`);
const activeIdentity = await db.query<{ uid: string | null; role: string }>("select auth.uid() as uid, current_user as role");
assert.equal(activeIdentity.rows[0]?.role, "authenticated");
assert.equal(activeIdentity.rows[0]?.uid, riderA);
const horseInsert = await db.query<{ id: string }>(`
  insert into public.horses(owner_id, name, discipline, is_primary)
  values ('${riderA}', 'Ralfy', 'jumping', true) returning id
`);
const horseId = horseInsert.rows[0]?.id;
assert.ok(horseId);
const onboardingOne = await db.query<{ horse_id: string }>(`
  select horse_id from public.complete_equina_onboarding(
    'Ilinca A', 'en', 'jumping', 'intermediate', 'Ralfy', 'Warmblood', null
  )
`);
const onboardingTwo = await db.query<{ horse_id: string }>(`
  select horse_id from public.complete_equina_onboarding(
    'Ilinca A', 'en', 'jumping', 'intermediate', 'Ralfy', 'Warmblood', null
  )
`);
assert.equal(onboardingOne.rows[0]?.horse_id, horseId);
assert.equal(onboardingTwo.rows[0]?.horse_id, horseId, "Onboarding retries must reuse the primary horse.");
await db.exec(`reset role;`);
const onboardingState = await db.query<{
  primary_horses: number;
  audit_events: number;
  starter_packs: number;
  starter_audits: number;
  academy_focus: string;
}>(`
  select
    (select count(*)::int from public.horses where owner_id = $1 and is_primary and archived_at is null) as primary_horses,
    (select count(*)::int from public.account_audit_events where user_id = $1 and event_type = 'onboarding_completed') as audit_events,
    (select count(*)::int from public.onboarding_starter_packs where user_id = $1) as starter_packs,
    (select count(*)::int from public.account_audit_events where user_id = $1 and event_type = 'starter_pack_unlocked') as starter_audits,
    (select academy_focus from public.user_preferences where user_id = $1) as academy_focus
`, [riderA]);
assert.equal(onboardingState.rows[0]?.primary_horses, 1);
assert.equal(onboardingState.rows[0]?.audit_events, 1, "Onboarding retry must not duplicate its completion audit.");
assert.equal(onboardingState.rows[0]?.starter_packs, 1, "Onboarding must persist one starter pack.");
assert.equal(onboardingState.rows[0]?.starter_audits, 1, "Onboarding retry must not duplicate its starter pack audit.");
assert.equal(onboardingState.rows[0]?.academy_focus, "Rhythm");

await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${riderA}', false);`);
await assert.rejects(
  db.query("update public.profiles set avatar_path = 'forged/avatar.jpg' where id = $1", [riderA]),
  /permission denied/,
  "Avatar paths must only be set by complete-upload."
);
await assert.rejects(
  db.query("update public.profiles set onboarding_completed_at = null where id = $1", [riderA]),
  /permission denied/,
  "Clients must not forge onboarding completion state."
);
await assert.rejects(
  db.query("update public.horses set photo_path = 'forged/horse.jpg' where id = $1", [horseId]),
  /permission denied/,
  "Horse photo paths must only be set by complete-upload."
);
await assert.rejects(
  db.query(`
    insert into storage.objects(bucket_id, name, owner_id)
    values ('avatars', $1, $2)
  `, [`${riderA}/direct-upload.jpg`, riderA]),
  /row-level security/,
  "Authenticated clients must not bypass signed upload tickets."
);
await assert.rejects(
  db.query(`
    select horse_id from public.complete_equina_onboarding(
      'Ilinca A', 'en', 'jumping', 'intermediate', 'Ralfy', 'Warmblood', 'forged/horse.jpg'
    )
  `),
  /upload service/,
  "Onboarding must not provide a back door for horse photo paths."
);

await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub', '${riderB}', false);`);
const riderOnlyOnboarding = await db.query<{ horse_id: string | null }>(`
  select horse_id from public.complete_equina_onboarding(
    'Rider Without Horse', 'en', 'dressage', 'beginner', null, null, null
  )
`);
assert.equal(riderOnlyOnboarding.rows[0]?.horse_id, null, "Rider-first onboarding must not create a placeholder horse.");
await db.exec(`reset role;`);
const riderOnlyState = await db.query<{ horses: number; use_selected_horse: boolean; has_horse: boolean }>(`
  select
    (select count(*)::int from public.horses where owner_id = $1) as horses,
    (select use_selected_horse from public.user_preferences where user_id = $1) as use_selected_horse,
    (select (detail->>'has_horse')::boolean from public.account_audit_events
      where user_id = $1 and event_type = 'onboarding_completed' limit 1) as has_horse
`, [riderB]);
assert.equal(riderOnlyState.rows[0]?.horses, 0);
assert.equal(riderOnlyState.rows[0]?.use_selected_horse, false);
assert.equal(riderOnlyState.rows[0]?.has_horse, false);

await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub', '${riderA}', false);`);
const ownPreferences = await db.query<{ user_id: string }>("select user_id from public.user_preferences");
assert.deepEqual(ownPreferences.rows.map((row) => row.user_id), [riderA]);
const ownStarterPack = await db.query<{ user_id: string }>("select user_id from public.onboarding_starter_packs");
assert.deepEqual(ownStarterPack.rows.map((row) => row.user_id), [riderA]);
await db.exec(`select set_config('request.jwt.claim.sub', '${riderC}', false);`);
const hiddenPreferences = await db.query("select user_id from public.user_preferences where user_id = $1", [riderA]);
assert.equal(hiddenPreferences.rows.length, 0, "A third user must not read another rider's preferences.");
const hiddenStarterPack = await db.query("select user_id from public.onboarding_starter_packs where user_id = $1", [riderA]);
assert.equal(hiddenStarterPack.rows.length, 0, "A third user must not read another rider's starter pack.");
const forgedPreferences = await db.query(
  "update public.user_preferences set academy_focus = 'Forged' where user_id = $1 returning user_id",
  [riderA]
);
assert.equal(forgedPreferences.rows.length, 0, "A third user must not mutate another rider's preferences.");
await assert.rejects(
  db.query(
    "insert into public.account_deletion_requests(user_id, reason, scheduled_for) values ($1, 'Bypass recent auth', now() + interval '14 days')",
    [riderA]
  ),
  /permission denied/,
  "Account deletion scheduling must pass through the recent-auth Edge Function."
);
await db.exec(`reset role; set role service_role;`);
const serverDeletionRequest = await db.query<{ id: string }>(`
  insert into public.account_deletion_requests(user_id, reason, scheduled_for)
  values ($1, 'Server-authorized test', now() + interval '14 days')
  returning id
`, [riderA]);
assert.ok(serverDeletionRequest.rows[0]?.id);
await db.query("delete from public.account_deletion_requests where user_id = $1", [riderA]);
await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub', '${riderA}', false);`);
const recordInsert = await db.query<{ id: string }>(`
  insert into public.horse_records(horse_id, created_by, record_type, title, occurred_on)
  values ($1, $2, 'vet', 'Annual soundness check', current_date) returning id
`, [horseId, riderA]);
assert.ok(recordInsert.rows[0]?.id);
await assert.rejects(
  db.query(`
    insert into public.horse_record_files(
      record_id, uploaded_by, object_path, original_name, mime_type, byte_size
    ) values ($1, $2, 'forged/record.pdf', 'record.pdf', 'application/pdf', 100)
  `, [recordInsert.rows[0]?.id, riderA]),
  /permission denied/,
  "Record files must be registered by complete-upload."
);
await assert.rejects(
  db.query("delete from public.horse_records where id = $1", [recordInsert.rows[0]?.id]),
  /permission denied/,
  "Record deletion must go through the file-cleaning Edge Function."
);

await db.exec(`select set_config('request.jwt.claim.sub', '${riderB}', false);`);
const privateHorse = await db.query("select id from public.horses where id = $1", [horseId]);
assert.equal(privateHorse.rows.length, 0, "Another rider must not read a private horse.");
await assert.rejects(
  db.query(`insert into public.horse_records(horse_id, created_by, record_type, title) values ($1, $2, 'note', 'Unauthorized note')`, [horseId, riderB]),
  /row-level security/
);

await db.exec(`select set_config('request.jwt.claim.sub', '${riderA}', false);`);
await db.query("select horse_id from public.set_horse_collaborator($1, $2, 'viewer')", [horseId, riderB]);
await db.exec(`select set_config('request.jwt.claim.sub', '${riderB}', false);`);
const acceptedCollaboration = await db.query<{ accepted_at: string }>(`
  update public.horse_collaborators set accepted_at = now()
  where horse_id = $1 and user_id = $2 returning accepted_at
`, [horseId, riderB]);
assert.ok(acceptedCollaboration.rows[0]?.accepted_at);
const sharedHorse = await db.query("select id from public.horses where id = $1", [horseId]);
assert.equal(sharedHorse.rows.length, 1, "An accepted viewer must be able to read the shared horse.");
await assert.rejects(
  db.query(`insert into public.horse_records(horse_id, created_by, record_type, title) values ($1, $2, 'note', 'Viewer edit')`, [horseId, riderB]),
  /row-level security/,
  "A viewer must not edit horse records."
);

await db.exec(`select set_config('request.jwt.claim.sub', '${riderC}', false);`);
await assert.rejects(
  db.query("select id from public.create_coach_conversation($1, 'Rhythm', 'Normal week', 'Concise')", [horseId]),
  /Horse is not available/,
  "Ralf must not receive a horse the rider cannot access."
);

await db.exec(`select set_config('request.jwt.claim.sub', '${riderA}', false);`);
const coachConversation = await db.query<{ id: string }>(`
  select id from public.create_coach_conversation($1, 'Rhythm', 'Normal week', 'Concise')
`, [horseId]);
const coachConversationId = coachConversation.rows[0]?.id;
assert.ok(coachConversationId);
await assert.rejects(
  db.query(`
    insert into public.coach_messages(conversation_id, role, body, client_nonce)
    values ($1, 'assistant', 'Forged assistant response', $2)
  `, [coachConversationId, "41000000-0000-4000-8000-000000000001"]),
  /permission denied/,
  "A mobile client must not insert an assistant message."
);

const coachNonce = "41000000-0000-4000-8000-000000000002";
await db.exec(`reset role; set role service_role;`);
const coachUserMessage = await db.query<{ id: string }>(`
  insert into public.coach_messages(
    conversation_id, role, body, client_nonce, status, based_on, safety_category
  ) values ($1, 'user', 'How should I approach the next ride?', $2, 'complete', '{}', 'none')
  returning id
`, [coachConversationId, coachNonce]);
const coachAssistantMessage = await db.query<{ id: string }>(`
  insert into public.coach_messages(
    conversation_id, role, body, client_nonce, status, based_on, confidence, safety_category
  ) values (
    $1, 'assistant', 'Keep one clear training question and finish after an easy repetition.',
    $2, 'complete', array['rider profile', 'selected horse'], 'medium', 'none'
  )
  returning id
`, [coachConversationId, coachNonce]);
assert.ok(coachUserMessage.rows[0]?.id);
assert.ok(coachAssistantMessage.rows[0]?.id);
await assert.rejects(
  db.query(`
    insert into public.coach_messages(conversation_id, role, body, client_nonce)
    values ($1, 'assistant', 'Duplicate response', $2)
  `, [coachConversationId, coachNonce]),
  /unique/,
  "A repeated coach nonce must not create a second assistant response."
);
await db.query(`
  insert into public.coach_message_operations(message_id, provider_name, model_name)
  values ($1, 'test-provider', 'test-model')
`, [coachAssistantMessage.rows[0]?.id]);

await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub', '${riderC}', false);`);
const hiddenCoachConversation = await db.query("select id from public.coach_conversations where id = $1", [coachConversationId]);
const hiddenCoachMessages = await db.query("select id from public.coach_messages where conversation_id = $1", [coachConversationId]);
assert.equal(hiddenCoachConversation.rows.length, 0, "A third rider must not read another rider's Ralf conversation.");
assert.equal(hiddenCoachMessages.rows.length, 0, "A third rider must not infer Ralf messages.");
await assert.rejects(
  db.query("select provider_name from public.coach_message_operations"),
  /permission denied/,
  "Provider metadata must remain server-only."
);

await db.exec(`select set_config('request.jwt.claim.sub', '${riderA}', false);`);
const feedback = await db.query<{ message_id: string }>(`
  insert into public.coach_message_feedback(user_id, message_id, useful)
  values ($1, $2, true) returning message_id
`, [riderA, coachAssistantMessage.rows[0]?.id]);
assert.equal(feedback.rows[0]?.message_id, coachAssistantMessage.rows[0]?.id);

await db.exec(`reset role; set role service_role;`);
const requestKey = "42000000-0000-4000-8000-000000000001";
const firstUsage = await db.query<{ record_coach_request: boolean }>(
  "select public.record_coach_request($1, $2)",
  [riderA, requestKey]
);
const duplicateUsage = await db.query<{ record_coach_request: boolean }>(
  "select public.record_coach_request($1, $2)",
  [riderA, requestKey]
);
assert.equal(firstUsage.rows[0]?.record_coach_request, true);
assert.equal(duplicateUsage.rows[0]?.record_coach_request, false, "A retry must not consume a second AI usage slot.");
for (let index = 2; index <= 8; index += 1) {
  await db.query("select public.record_coach_request($1, $2)", [
    riderA,
    `42000000-0000-4000-8000-${String(index).padStart(12, "0")}`
  ]);
}
await assert.rejects(
  db.query("select public.record_coach_request($1, $2)", [
    riderA,
    "42000000-0000-4000-8000-000000000009"
  ]),
  /minute limit/,
  "Ralf sends must be rate limited at the database boundary."
);

await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub', '${riderA}', false);`);
const jumpingSpace = await db.query<{ id: string }>("select id from public.club_spaces where slug = 'jumping'");
const spaceId = jumpingSpace.rows[0]?.id;
assert.ok(spaceId);
const postInsert = await db.query<{ id: string }>(`
  insert into public.club_posts(author_id, space_id, post_type, body)
  values ($1, $2, 'journal', 'A calm line and a softer landing today.') returning id
`, [riderA, spaceId]);
const postId = postInsert.rows[0]?.id;
assert.ok(postId);
await assert.rejects(
  db.query(`
    insert into public.club_post_media(
      post_id, uploaded_by, object_path, media_type, mime_type, byte_size, position
    ) values ($1, $2, 'forged/post.jpg', 'image', 'image/jpeg', 100, 0)
  `, [postId, riderA]),
  /permission denied/,
  "Club media must be registered by complete-upload."
);

await db.exec(`reset role;`);
await db.query(`
  insert into public.seller_accounts(user_id, seller_type, country_code, verification_status, stripe_account_id, payouts_enabled, details_submitted)
  values ($1, 'private', 'DE', 'verified', 'acct_test_seller_a', true, true)
`, [riderA]);
await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${riderA}', false);`);
const listingInsert = await db.query<{ id: string }>(`
  insert into public.listings(seller_id, category, title, description, brand_name, condition_grade, price_minor, currency, country_code, locality)
  values ($1, 'pad', 'Kentucky velvet saddle pad full size', 'Clean used pad with condition evidence.', 'Kentucky', 'good', 14500, 'EUR', 'DE', 'Aachen')
  returning id
`, [riderA]);
const listingId = listingInsert.rows[0]?.id;
assert.ok(listingId);
await assert.rejects(
  db.query(`
    insert into public.listing_photos(
      listing_id, uploaded_by, object_path, required_angle, mime_type, byte_size, position
    ) values ($1, $2, 'forged/listing.jpg', 'top', 'image/jpeg', 100, 0)
  `, [listingId, riderA]),
  /permission denied/,
  "Listing media must be registered by complete-upload."
);
await db.exec(`reset role;`);
for (const [position, angle] of ["top", "underside", "binding", "wear_closeup"].entries()) {
  await db.query(`
    insert into public.listing_photos(listing_id, uploaded_by, object_path, required_angle, mime_type, byte_size, position)
    values ($1, $2, $3, $4, 'image/jpeg', 1000, $5)
  `, [listingId, riderA, `${riderA}/${listingId}/${angle}.jpg`, angle, position]);
}
await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${riderA}', false);`);
const rateInsert = await db.query<{ id: string }>(`
  insert into public.listing_shipping_rates(listing_id, country_code, service_name, amount_minor, min_days, max_days, tracked, insured_up_to_minor)
  values ($1, '*', 'Tracked EU', 1800, 3, 7, true, 20000) returning id
`, [listingId]);
const shippingRateId = rateInsert.rows[0]?.id;
assert.ok(shippingRateId);
const published = await db.query<{ status: string }>("select status from public.publish_listing($1)", [listingId]);
assert.equal(published.rows[0]?.status, "pending_review", "Listings must wait for content moderation.");
await db.exec(`reset role;`);
await db.query("update public.listings set status = 'active', published_at = now() where id = $1", [listingId]);

await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${riderB}', false);`);
const conversation = await db.query<{ create_marketplace_conversation: string }>("select public.create_marketplace_conversation($1)", [listingId]);
const conversationId = conversation.rows[0]?.create_marketplace_conversation;
assert.ok(conversationId);
const firstNonce = "20000000-0000-4000-8000-000000000001";
const firstMarketplaceMessage = await db.query<{ id: string }>(`
  insert into public.marketplace_messages(conversation_id, sender_id, client_nonce, body)
  values ($1, $2, $3, 'Could you confirm the exact measurements?') returning id
`, [conversationId, riderB, firstNonce]);
await assert.rejects(
  db.query(`insert into public.marketplace_messages(conversation_id, sender_id, client_nonce, body) values ($1, $2, $3, 'Duplicate send')`, [conversationId, riderB, firstNonce]),
  /unique/
);

await db.exec(`reset role; set role service_role;`);
const notificationPayload = await db.query<{ payload: Record<string, unknown>; status: string }>(`
  select payload, status from public.notification_outbox
  where dedupe_key = $1
`, [`marketplace-message:${firstMarketplaceMessage.rows[0]?.id}`]);
assert.equal(notificationPayload.rows[0]?.status, "pending");
assert.equal("body" in (notificationPayload.rows[0]?.payload ?? {}), false, "Push outbox must not contain a message body.");

await db.query(`
  insert into public.push_devices(user_id, token_hash, expo_push_token, platform, app_version)
  values ($1, repeat('a', 64), 'ExponentPushToken[backend-test-device]', 'ios', '0.1.0')
`, [riderA]);
await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub', '${riderC}', false);`);
await assert.rejects(
  db.query("select id from public.push_devices"),
  /permission denied/,
  "Mobile users must not read push tokens."
);
const hiddenMarketplaceConversation = await db.query(
  "select id from public.marketplace_conversations where id = $1",
  [conversationId]
);
const hiddenMarketplaceMessages = await db.query(
  "select id from public.marketplace_messages where conversation_id = $1",
  [conversationId]
);
assert.equal(hiddenMarketplaceConversation.rows.length, 0, "A third user must not read a buyer-seller conversation.");
assert.equal(hiddenMarketplaceMessages.rows.length, 0, "A third user must not infer buyer-seller messages.");

await db.exec(`select set_config('request.jwt.claim.sub', '${riderB}', false);`);
await db.query("update public.notification_preferences set human_messages = false where user_id = $1", [riderB]);
await db.exec(`select set_config('request.jwt.claim.sub', '${riderA}', false);`);
const sellerReplyNonce = "20000000-0000-4000-8000-000000000010";
const sellerReply = await db.query<{ id: string }>(`
  insert into public.marketplace_messages(conversation_id, sender_id, client_nonce, body)
  values ($1, $2, $3, 'The panel measurements are in the listing.')
  returning id
`, [conversationId, riderA, sellerReplyNonce]);
await db.exec(`reset role; set role service_role;`);
const suppressedNotification = await db.query<{ status: string }>(`
  select status from public.notification_outbox
  where dedupe_key = $1
`, [`marketplace-message:${sellerReply.rows[0]?.id}`]);
assert.equal(suppressedNotification.rows[0]?.status, "suppressed", "Disabled message notifications must not be delivered.");

await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub', '${riderB}', false);`);
await db.query("insert into public.user_blocks(blocker_id, blocked_id) values ($1, $2)", [riderB, riderA]);
const blockedFeed = await db.query("select id from public.club_posts where id = $1", [postId]);
assert.equal(blockedFeed.rows.length, 0, "Blocked accounts must disappear from Club.");
await assert.rejects(
  db.query(`insert into public.marketplace_messages(conversation_id, sender_id, client_nonce, body) values ($1, $2, $3, 'Blocked send')`, [conversationId, riderB, "20000000-0000-4000-8000-000000000002"]),
  /Messaging is unavailable/
);
await assert.rejects(
  db.query("select public.create_marketplace_conversation($1)", [listingId]),
  /Messaging is unavailable/,
  "Blocked users must not reopen a marketplace conversation."
);
await db.exec(`reset role;`);
await db.query(`
  insert into public.user_sanctions(user_id, kind, reason, issued_by, expires_at)
  values ($1, 'suspension', 'Automated backend security test', $2, now() + interval '1 day')
`, [riderB, riderA]);
await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${riderB}', false);`);
await assert.rejects(
  db.query(`insert into public.club_posts(author_id, space_id, post_type, body) values ($1, $2, 'journal', 'Suspended post')`, [riderB, spaceId]),
  /temporarily restricted/,
  "Suspended accounts must be rejected by server-side mutation triggers."
);

await db.exec(`reset role;`);
const quoteInsert = await db.query<{ id: string }>(`
  insert into public.checkout_quotes(
    buyer_id, listing_id, shipping_rate_id, item_amount_minor, shipping_amount_minor,
    tax_amount_minor, protection_fee_minor, currency, destination_country, tax_basis, expires_at
  ) values ($1, $2, $3, 14500, 1800, 0, 1160, 'EUR', 'FR', 'private_seller_test', now() + interval '15 minutes')
  returning id
`, [riderC, listingId, shippingRateId]);
const quoteId = quoteInsert.rows[0]?.id;
assert.ok(quoteId);
await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${riderC}', false);`);
await assert.rejects(
  db.query("select public.begin_checkout_for_user($1, $2, $3, '{}'::jsonb, '2026-07-21')", [riderC, quoteId, "30000000-0000-4000-8000-000000000099"]),
  /permission denied/,
  "The mobile role must not call the reservation RPC directly."
);
await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false); set role service_role;`);
const checkoutKey = "30000000-0000-4000-8000-000000000001";
const checkoutOne = await db.query<{ id: string }>(`
  select id from public.begin_checkout_for_user($1, $2, $3, '{"name":"Rider C","country":"FR","postal_code":"75001"}'::jsonb, '2026-07-21')
`, [riderC, quoteId, checkoutKey]);
const checkoutTwo = await db.query<{ id: string }>(`
  select id from public.begin_checkout_for_user($1, $2, $3, '{"name":"Rider C","country":"FR","postal_code":"75001"}'::jsonb, '2026-07-21')
`, [riderC, quoteId, checkoutKey]);
assert.equal(checkoutOne.rows[0]?.id, checkoutTwo.rows[0]?.id, "Checkout retry must be idempotent.");
await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub', '${riderC}', false);`);
const checkoutTerms = await db.query<{ marketplace_terms_version: string; terms_accepted_at: string }>(
  "select marketplace_terms_version, terms_accepted_at from public.orders where id = $1",
  [checkoutOne.rows[0]?.id]
);
assert.equal(checkoutTerms.rows[0]?.marketplace_terms_version, "2026-07-21");
assert.ok(checkoutTerms.rows[0]?.terms_accepted_at);

await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub', '${riderB}', false);`);
const unrelatedOrder = await db.query("select id from public.orders where id = $1", [checkoutOne.rows[0]?.id]);
assert.equal(unrelatedOrder.rows.length, 0, "Unrelated riders must not read an order.");

await db.exec(`reset role;`);
await db.query("update public.orders set status = 'paid', paid_at = now() where id = $1", [checkoutOne.rows[0]?.id]);
await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${riderA}', false);`);
const shippedOrder = await db.query<{ status: string }>(`
  select status from public.mark_order_shipped($1, 'DHL', 'TRACK-EQUINA-001', 'https://tracking.example/equina-001')
`, [checkoutOne.rows[0]?.id]);
assert.equal(shippedOrder.rows[0]?.status, "shipped");
const shipmentInsurance = await db.query<{ insured_amount_minor: number }>(
  "select insured_amount_minor from public.shipments where order_id = $1",
  [checkoutOne.rows[0]?.id]
);
assert.equal(shipmentInsurance.rows[0]?.insured_amount_minor, 20000, "Shipment must preserve the quoted insurance coverage.");

await db.exec(`reset role; set role service_role;`);
const cleanupJob = await db.query<{ id: number }>(`
  insert into public.storage_cleanup_jobs(bucket_id, object_path)
  values ('horse-records', 'worker-test/private-record.pdf')
  returning id
`);
const firstClaim = await db.query<{ id: number; lease_token: string; attempts: number }>(`
  select id, lease_token, attempts from public.claim_storage_cleanup_jobs(1, 300)
`);
assert.equal(firstClaim.rows[0]?.id, cleanupJob.rows[0]?.id);
assert.equal(firstClaim.rows[0]?.attempts, 1);
const concurrentClaim = await db.query(`select id from public.claim_storage_cleanup_jobs(1, 300)`);
assert.equal(concurrentClaim.rows.length, 0, "A live lease must prevent a second worker from claiming the same job.");
await db.query(
  "update public.storage_cleanup_jobs set lease_expires_at = now() - interval '1 second' where id = $1",
  [cleanupJob.rows[0]?.id]
);
const recoveredClaim = await db.query<{ id: number; lease_token: string; attempts: number }>(`
  select id, lease_token, attempts from public.claim_storage_cleanup_jobs(1, 300)
`);
assert.equal(recoveredClaim.rows[0]?.id, cleanupJob.rows[0]?.id, "An expired lease must be recoverable.");
assert.equal(recoveredClaim.rows[0]?.attempts, 2);
assert.notEqual(recoveredClaim.rows[0]?.lease_token, firstClaim.rows[0]?.lease_token);
const staleCompletion = await db.query<{ accepted: boolean }>(
  "select public.complete_storage_cleanup_job($1, $2) as accepted",
  [cleanupJob.rows[0]?.id, firstClaim.rows[0]?.lease_token]
);
assert.equal(staleCompletion.rows[0]?.accepted, false, "A stale worker token must not complete a reclaimed job.");
const activeCompletion = await db.query<{ accepted: boolean }>(
  "select public.complete_storage_cleanup_job($1, $2) as accepted",
  [cleanupJob.rows[0]?.id, recoveredClaim.rows[0]?.lease_token]
);
assert.equal(activeCompletion.rows[0]?.accepted, true);

const exportRequest = await db.query<{ id: string }>(`
  insert into public.data_export_requests(
    user_id, status, object_path, completed_at, expires_at
  ) values (
    $1, 'ready', 'exports/worker-test.zip', now() - interval '2 days',
    now() - interval '1 day'
  )
  returning id
`, [riderA]);
const firstExportClaim = await db.query<{
  id: string;
  cleanup_lease_token: string;
  cleanup_attempts: number;
}>(`
  select id, cleanup_lease_token, cleanup_attempts
  from public.claim_data_export_cleanup(1, 300)
`);
assert.equal(firstExportClaim.rows[0]?.id, exportRequest.rows[0]?.id);
assert.equal(firstExportClaim.rows[0]?.cleanup_attempts, 1);
const concurrentExportClaim = await db.query("select id from public.claim_data_export_cleanup(1, 300)");
assert.equal(
  concurrentExportClaim.rows.length,
  0,
  "A live export cleanup lease must prevent a concurrent claim."
);
await db.query(
  "update public.data_export_requests set cleanup_lease_expires_at = now() - interval '1 second' where id = $1",
  [exportRequest.rows[0]?.id]
);
const recoveredExportClaim = await db.query<{
  cleanup_lease_token: string;
  cleanup_attempts: number;
}>(`
  select cleanup_lease_token, cleanup_attempts
  from public.claim_data_export_cleanup(1, 300)
`);
assert.equal(recoveredExportClaim.rows[0]?.cleanup_attempts, 2);
assert.notEqual(
  recoveredExportClaim.rows[0]?.cleanup_lease_token,
  firstExportClaim.rows[0]?.cleanup_lease_token
);
const staleExportCompletion = await db.query<{ accepted: boolean }>(
  "select public.complete_data_export_cleanup($1, $2) as accepted",
  [exportRequest.rows[0]?.id, firstExportClaim.rows[0]?.cleanup_lease_token]
);
assert.equal(
  staleExportCompletion.rows[0]?.accepted,
  false,
  "A stale export cleanup worker must not publish completion."
);
const activeExportCompletion = await db.query<{ accepted: boolean }>(
  "select public.complete_data_export_cleanup($1, $2) as accepted",
  [exportRequest.rows[0]?.id, recoveredExportClaim.rows[0]?.cleanup_lease_token]
);
assert.equal(activeExportCompletion.rows[0]?.accepted, true);
const expiredExport = await db.query<{
  status: string;
  object_path: string | null;
  cleanup_status: string;
}>(
  "select status, object_path, cleanup_status from public.data_export_requests where id = $1",
  [exportRequest.rows[0]?.id]
);
assert.equal(expiredExport.rows[0]?.status, "expired");
assert.equal(expiredExport.rows[0]?.object_path, null);
assert.equal(expiredExport.rows[0]?.cleanup_status, "completed");

// Ride journal. A training journal is private to its rider: unlike horse
// records, sharing a horse must not share the notes written while riding it.
await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub', '${riderA}', false);`);
const rideEntry = await db.query<{ id: string }>(`
  insert into public.ride_entries(
    rider_id, horse_id, discipline, focus, planned_duration,
    started_at, completed_at, elapsed_seconds, completed_phases, total_phases, mood, rider_note
  ) values (
    $1, $2, 'dressage', 'Rhythm', '40 min',
    now() - interval '45 minutes', now(), 2400, 3, 4, 'focused', 'Softer in the left rein.'
  ) returning id
`, [riderA, horseId]);
const rideEntryId = rideEntry.rows[0]?.id;
assert.ok(rideEntryId, "A rider must be able to log a ride.");

await assert.rejects(
  db.query(`
    insert into public.ride_entries(rider_id, discipline, focus, started_at, completed_at, elapsed_seconds, completed_phases, total_phases)
    values ($1, 'jumping', 'Impulsion', now(), now(), 600, 1, 2)
  `, [riderB]),
  /row-level security/,
  "A rider must not write a ride entry attributed to someone else."
);

// riderB is an accepted viewer on this horse and can read it, proving the
// journal boundary is independent of horse collaboration.
await db.exec(`select set_config('request.jwt.claim.sub', '${riderB}', false);`);
const collaboratorRides = await db.query("select id from public.ride_entries where id = $1", [rideEntryId]);
assert.equal(collaboratorRides.rows.length, 0, "A horse collaborator must not read another rider's journal.");
const collaboratorEdit = await db.query("update public.ride_entries set focus = 'Hijacked' where id = $1 returning id", [rideEntryId]);
assert.equal(collaboratorEdit.rows.length, 0, "A horse collaborator must not edit another rider's journal.");

await db.exec(`select set_config('request.jwt.claim.sub', '${riderC}', false);`);
const strangerRides = await db.query("select id from public.ride_entries where id = $1", [rideEntryId]);
assert.equal(strangerRides.rows.length, 0, "An unrelated rider must not read a journal entry.");
const strangerDelete = await db.query("delete from public.ride_entries where id = $1 returning id", [rideEntryId]);
assert.equal(strangerDelete.rows.length, 0, "An unrelated rider must not delete a journal entry.");

await db.exec(`select set_config('request.jwt.claim.sub', '${riderA}', false);`);
const ownRides = await db.query<{ focus: string }>("select focus from public.ride_entries where id = $1", [rideEntryId]);
assert.equal(ownRides.rows.length, 1, "The owning rider must still read the entry.");
assert.equal(ownRides.rows[0]?.focus, "Rhythm", "No other rider may have altered the entry.");

await assert.rejects(
  db.query(`
    insert into public.ride_entries(rider_id, discipline, focus, started_at, completed_at, elapsed_seconds, completed_phases, total_phases)
    values ($1, 'dressage', 'Backwards', now(), now() - interval '10 minutes', 600, 1, 2)
  `, [riderA]),
  /ride_entries_finishes_after_start/,
  "A ride must not finish before it started."
);
await assert.rejects(
  db.query(`
    insert into public.ride_entries(rider_id, discipline, focus, started_at, completed_at, elapsed_seconds, completed_phases, total_phases)
    values ($1, 'dressage', 'Impossible', now(), now(), 600, 5, 3)
  `, [riderA]),
  /ride_entries_phases_consistent/,
  "Completed phases must not exceed the planned total."
);

await db.close();
console.log("Backend migrations executed successfully in isolated Postgres.");
