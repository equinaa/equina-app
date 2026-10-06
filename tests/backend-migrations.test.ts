import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { openBackendDatabase } from "./backend-database";

const db = await openBackendDatabase();

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
assert.equal(seededFlags.rows.length, 15);
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
// Every feature on -- except plans: the tests below run in the founding phase,
// as production does until riders can subscribe. The plans section turns them
// on for the riders it names. public_access is among them, so these riders are
// through the beta door (202610060003); tests/beta.test.ts covers the door.
await db.exec(`reset role; update public.app_feature_flags set enabled = true, rollout_percent = 100 where key <> 'plans';`);
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
const staleOnboarding = await db.query<{ horse_id: string }>(`
  select horse_id from public.complete_equina_onboarding(
    'Someone Else', 'en', 'dressage', 'beginner', 'Other Horse', null, null
  )
`);
assert.equal(staleOnboarding.rows[0]?.horse_id, horseId);
const afterStaleOnboarding = await db.query<{ display_name: string; discipline: string; horse_name: string }>(`
  select p.display_name, p.discipline::text as discipline, h.name as horse_name
  from public.my_profile() p join public.horses h on h.owner_id = p.id and h.is_primary
  where p.id = $1
`, [riderA]);
assert.deepEqual(
  afterStaleOnboarding.rows[0],
  { display_name: "Ilinca A", discipline: "jumping", horse_name: "Ralfy" },
  "A finished onboarding must not be rewritten by a second completion."
);
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
const editableProfile = await db.query<{ id: string }>(
  "update public.profiles set display_name = 'Ilinca A', location = 'Stall 4, north barn', bio = 'Rides before work.' where id = $1 returning id",
  [riderA]
);
assert.equal(editableProfile.rows[0]?.id, riderA, "Riders must still edit their own profile fields.");

// Riders see each other by name and photo, nothing more (202610050002). Where
// someone keeps their horse is physical security, and sign-up is open.
await db.exec(`select set_config('request.jwt.claim.sub', '${riderB}', false);`);
const otherRiderCard = await db.query<{ id: string; display_name: string; avatar_path: string | null }>(
  "select id, display_name, avatar_path from public.profiles where id = $1", [riderA]
);
assert.deepEqual(otherRiderCard.rows, [{ id: riderA, display_name: "Ilinca A", avatar_path: null }],
  "Riders see each other's name and photo, as the Club and messages show them.");
for (const column of ["location", "bio", "discipline", "skill_level", "locale", "onboarding_completed_at", "created_at"]) {
  await assert.rejects(
    db.query(`select ${column} from public.profiles where id = $1`, [riderA]),
    /permission denied/,
    `Another rider's ${column} must not be readable.`
  );
}
await assert.rejects(db.query("select * from public.profiles"), /permission denied/, "Listing whole profiles must be refused.");
const ownProfileOnly = await db.query<{ id: string }>("select id from public.my_profile()");
assert.deepEqual(ownProfileOnly.rows, [{ id: riderB }], "my_profile() answers with the caller's own profile and no one else's.");

await db.exec(`select set_config('request.jwt.claim.sub', '${riderA}', false);`);
const ownProfile = await db.query<{ location: string; bio: string; discipline: string; skill_level: string }>(
  "select location, bio, discipline::text as discipline, skill_level::text as skill_level from public.my_profile()"
);
assert.deepEqual(ownProfile.rows, [{ location: "Stall 4, north barn", bio: "Rides before work.", discipline: "jumping", skill_level: "intermediate" }],
  "A rider reads their own whole profile through my_profile().");

await db.exec("reset role; set role anon; select set_config('request.jwt.claim.sub', '', false);");
await assert.rejects(db.query("select display_name from public.profiles"), /permission denied/, "Signed-out visitors read no profile at all.");
await assert.rejects(db.query("select * from public.my_profile()"), /permission denied/, "my_profile() needs an account.");
await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub', '${riderA}', false);`);
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
  "Account deletion scheduling must pass through the audited Edge Function."
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
  /(permission denied|row-level security)/,
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

// Hosted Supabase grants SELECT on every public table, so on a server-only
// table the boundary a client meets is RLS with no read policy: an empty
// result rather than an error. Either one keeps the rows server-only.
const visibleRows = async (sql: string) => {
  try {
    return (await db.query(sql)).rows.length;
  } catch (error) {
    if (error instanceof Error && /permission denied/.test(error.message)) return 0;
    throw error;
  }
};
assert.equal(
  await visibleRows("select provider_name from public.coach_message_operations"),
  0,
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
assert.equal(await visibleRows("select id from public.push_devices"), 0, "Mobile users must not read push tokens.");
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


// --- Ralf credit ledger -----------------------------------------------------

await db.exec("reset role;");

// Free's 15 was measured against real traffic; Plus and Premium arrived with
// the plans (202610060001), from Ilinca's draft. A tier with no row would
// still resolve to no credits.
const policies = await db.query<{ key: string; monthly_credits: number }>(
  "select key, monthly_credits from public.coach_credit_policies order by key"
);
assert.deepEqual(policies.rows, [
  { key: "free", monthly_credits: 15 },
  { key: "mid", monthly_credits: 100 },
  { key: "premium", monthly_credits: 300 }
]);

const spend = async (user: string, key: string, cost = 1) =>
  await db.query<{ spend_coach_credits: { spent: number; balance: number; idempotent: boolean } }>(
    "select public.spend_coach_credits($1, $2, $3, 'test') as spend_coach_credits",
    [user, key, cost]
  );
const balanceOf = async (user: string) => {
  const result = await db.query<{ balance: number }>(
    "select private.coach_credit_balance($1) as balance", [user]
  );
  return result.rows[0]?.balance ?? -1;
};

// While the flag is off nothing is metered, nothing is charged, and nothing is
// recorded. This is what lets the ledger ship before a paywall exists.
await db.exec("update public.app_feature_flags set enabled = false, rollout_percent = 0 where key = 'coach_credits';");
const unmetered = await spend(riderA, "20000000-0000-4000-8000-000000000000");
assert.deepEqual(unmetered.rows[0]?.spend_coach_credits, { metered: false, spent: 0, idempotent: false });
const lotsWhileOff = await db.query<{ n: number }>(
  "select count(*)::int as n from public.coach_credit_lots where user_id = $1", [riderA]
);
assert.equal(lotsWhileOff.rows[0]?.n, 0, "An unmetered call must not even grant the free allowance.");

await db.exec("update public.app_feature_flags set enabled = true, rollout_percent = 100 where key = 'coach_credits';");

// The free allowance is granted lazily, on first spend, with no sweeping job.
const firstSpend = await spend(riderA, "20000000-0000-4000-8000-000000000001");
assert.equal(firstSpend.rows[0]?.spend_coach_credits.spent, 1);
assert.equal(firstSpend.rows[0]?.spend_coach_credits.balance, 14,
  "The free tier grants 15 on first use, and the first message costs one of them.");

// A retried nonce must return the first result, not charge twice.
const retry = await spend(riderA, "20000000-0000-4000-8000-000000000001");
assert.equal(retry.rows[0]?.spend_coach_credits.idempotent, true);
assert.equal(await balanceOf(riderA), 14, "A device retrying after a timeout must not be charged again.");

// Granting is idempotent on (user, source, source_ref): a webhook replayed ten
// times grants once.
for (let attempt = 0; attempt < 3; attempt += 1) {
  await db.query(
    "select public.grant_coach_credits($1, 'purchased', 100, null, 'app_store', 'txn-1', 'pack')", [riderA]
  );
}
assert.equal(await balanceOf(riderA), 114, "Replaying a purchase webhook must grant its credits exactly once.");

// Credits bought through in-app purchase may not expire -- a store rule, so it
// is a constraint rather than a convention.
await assert.rejects(
  db.query(`insert into public.coach_credit_lots(user_id, bucket, granted, remaining, expires_at, source, source_ref)
            values ($1, 'purchased', 10, 10, now() + interval '30 days', 'app_store', 'txn-expiring')`, [riderA]),
  /coach_credit_lots_purchased_never_expire/,
  "Store rules forbid expiring purchased credits."
);

// What dies first is spent first, so a rider never loses a pack they paid for
// because an allowance was sitting next to it.
const before = await db.query<{ bucket: string; remaining: number }>(
  "select bucket, remaining from public.coach_credit_lots where user_id = $1 order by bucket", [riderA]
);
assert.deepEqual(before.rows, [{ bucket: "purchased", remaining: 100 }, { bucket: "subscription", remaining: 14 }]);
await spend(riderA, "20000000-0000-4000-8000-000000000002", 5);
const after = await db.query<{ bucket: string; remaining: number }>(
  "select bucket, remaining from public.coach_credit_lots where user_id = $1 order by bucket", [riderA]
);
assert.deepEqual(after.rows, [{ bucket: "purchased", remaining: 100 }, { bucket: "subscription", remaining: 9 }],
  "The expiring allowance must drain before the purchased pack.");

// A spend that crosses two batches records the split, so the refund can put
// each share back where it came from.
await spend(riderA, "20000000-0000-4000-8000-000000000003", 12);
const crossing = await db.query<{ lots: Array<{ lot: number; credits: number }> }>(
  "select lots from public.coach_credit_ledger where request_key = $1 and kind = 'spend'",
  ["20000000-0000-4000-8000-000000000003"]
);
assert.equal(crossing.rows[0]?.lots.length, 2, "A spend crossing two batches must record how it was split.");
assert.deepEqual(crossing.rows[0]?.lots.map((entry) => entry.credits), [9, 3]);

// Nobody pays for a provider failure.
await db.query("select public.refund_coach_credits($1, $2, 'provider failed')",
  [riderA, "20000000-0000-4000-8000-000000000003"]);
const refunded = await db.query<{ bucket: string; remaining: number }>(
  "select bucket, remaining from public.coach_credit_lots where user_id = $1 order by bucket", [riderA]
);
assert.deepEqual(refunded.rows, [{ bucket: "purchased", remaining: 100 }, { bucket: "subscription", remaining: 9 }],
  "A refund returns each share to the batch it came from.");

// Refunding twice must not mint credits.
await db.query("select public.refund_coach_credits($1, $2, 'duplicate')",
  [riderA, "20000000-0000-4000-8000-000000000003"]);
assert.equal(await balanceOf(riderA), 109, "A replayed refund must be a no-op, not a second credit.");

// Running out raises PT402, which PostgREST turns into HTTP 402, and the
// detail reports the balance BEFORE anything was drained.
await spend(riderA, "20000000-0000-4000-8000-000000000006", 100);
assert.equal(await balanceOf(riderA), 9);
await assert.rejects(
  db.query("select public.spend_coach_credits($1, $2, 10, 'too expensive')",
    [riderA, "20000000-0000-4000-8000-000000000004"]),
  (error: unknown) =>
    error instanceof Error &&
    /needed 10, spendable 9/.test(String((error as { detail?: string }).detail ?? error.message)),
  "An exhausted balance must report what the rider actually had, not the partially drained state."
);
assert.equal(await balanceOf(riderA), 9, "A failed spend must charge nothing at all -- not even the batches it walked.");

// The ledger is append-only. An audit trail that can be edited is a log.
await assert.rejects(
  db.query("update public.coach_credit_ledger set delta = 999 where user_id = $1", [riderA]),
  /append-only/,
  "The credit ledger must refuse edits."
);
await assert.rejects(
  db.query("delete from public.coach_credit_ledger where user_id = $1", [riderA]),
  /append-only/,
  "The credit ledger must refuse deletes."
);

// Batches and ledger are written together and must always agree.
const drift = await db.query("select * from private.coach_credit_drift()");
assert.deepEqual(drift.rows, [], "Lot totals and ledger totals must reconcile exactly.");

// The monthly window is anchored to the original moment and multiplied, never
// iterated: a rider who starts on the 31st must not walk backwards.
const anniversary = await db.query<{ period_start: Date }>(`
  select period_start from private.coach_credit_period('2026-01-31T09:00:00Z'::timestamptz, '2026-04-15T09:00:00Z'::timestamptz)
`);
assert.equal(
  anniversary.rows[0]?.period_start.toISOString().slice(0, 10), "2026-03-31",
  "31 March, not 28 March: the window is anchored to the original 31st and multiplied. " +
  "Iterating month by month would clamp at 28 February and never recover the 31st."
);

// A rider cannot read another rider's credits, and cannot write their own.
await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${riderB}', false);`);
const peeking = await db.query("select count(*)::int as n from public.coach_credit_lots");
assert.equal((peeking.rows[0] as { n: number }).n, 0, "Credits are private to the rider who holds them.");
await assert.rejects(
  db.query(`insert into public.coach_credit_lots(user_id, bucket, granted, remaining, source, source_ref)
            values ($1, 'promo', 500, 500, 'promo', 'self-service')`, [riderB]),
  /(row-level security|permission denied)/,
  "A rider must never be able to grant themselves credits."
);
await assert.rejects(
  db.query("select public.spend_coach_credits($1, $2, 1, 'direct')", [riderB, "20000000-0000-4000-8000-000000000005"]),
  /permission denied/,
  "Spending is a service-role path; the client never calls it directly."
);
await db.exec("reset role;");

// --- Academy content ---------------------------------------------------------

await db.exec("reset role;");

// Nothing is seeded. The ten lessons in the client name coaches who do not
// exist, and copying invented people into the database would make them records.
const lessonCount = await db.query<{ n: number }>("select count(*)::int as n from public.academy_lessons");
assert.equal(lessonCount.rows[0]?.n, 0, "The catalogue ships empty and fills when real lessons arrive.");

const lesson = await db.query<{ id: string }>(`
  insert into public.academy_lessons(slug, title, summary, category, discipline, level, access, duration_seconds, published_at)
  values ('contact-basics', 'Elastic contact', 'A softer hand while the horse stays forward.', 'Flatwork', 'dressage', 'intermediate', 'free', 1080, now())
  returning id
`);
const lessonId = lesson.rows[0]?.id as string;
assert.ok(lessonId);

const draft = await db.query<{ id: string }>(`
  insert into public.academy_lessons(slug, title, summary, category)
  values ('unfinished', 'Not ready', 'Still being filmed.', 'Flatwork')
  returning id
`);
const draftId = draft.rows[0]?.id as string;

// A lesson with no level suits every rider -- the client already treats a
// missing level as "suits anyone", and forcing one on would hide a leg-check
// lesson from somebody for no reason.
await db.query(`
  insert into public.academy_lessons(slug, title, summary, category, published_at)
  values ('leg-check', 'Checking legs after work', 'What to feel for, and when it matters.', 'Care', now())
`);

await db.query(`
  insert into public.academy_chapters(lesson_id, starts_at_seconds, title) values
    ($1, 0, 'Warm-up feel'),
    ($1, 260, 'Soft rein connection')
`, [lessonId]);

await assert.rejects(
  db.query("insert into public.academy_chapters(lesson_id, starts_at_seconds, title) values ($1, 0, 'Duplicate mark')", [lessonId]),
  /duplicate key/,
  "Two chapters cannot start at the same second."
);

await db.query("insert into public.academy_chapters(lesson_id, starts_at_seconds, title) values ($1, 0, 'Hidden')", [draftId]);

// A draft is not a lesson: riders browse the catalogue, but only what is
// published, and its chapters follow the same rule.
await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${riderA}', false);`);
const browsable = await db.query<{ slug: string }>("select slug from public.academy_lessons order by slug");
assert.deepEqual(browsable.rows.map((row) => row.slug), ["contact-basics", "leg-check"],
  "An unpublished lesson must not appear in the catalogue.");

const visibleChapters = await db.query<{ n: number }>("select count(*)::int as n from public.academy_chapters");
assert.equal(visibleChapters.rows[0]?.n, 2, "Chapters of a draft lesson stay hidden with it.");

// Progress writing goes through the same two-layer gate as every other
// mutation: the flag has to be on for this rider.
await db.exec("reset role; update public.app_feature_flags set enabled = false, rollout_percent = 0 where key = 'academy_progress';");
await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${riderA}', false);`);
await assert.rejects(
  db.query("insert into public.academy_progress(user_id, lesson_id, position_seconds) values ($1, $2, 120)", [riderA, lessonId]),
  /row-level security/,
  "Progress must not be writable while the feature is off."
);

await db.exec("reset role; update public.app_feature_flags set enabled = true, rollout_percent = 100 where key = 'academy_progress';");
await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${riderA}', false);`);
await db.query("insert into public.academy_progress(user_id, lesson_id, position_seconds) values ($1, $2, 120)", [riderA, lessonId]);

// Position and completion are separate facts. Scrubbing to the end is not
// finishing, and stopping at 95% is -- only the client knows which happened.
await db.query("update public.academy_progress set position_seconds = 1026, completed_at = now() where user_id = $1 and lesson_id = $2", [riderA, lessonId]);
const mine = await db.query<{ position_seconds: number; completed: boolean }>(
  "select position_seconds, completed_at is not null as completed from public.academy_progress where user_id = $1", [riderA]
);
assert.deepEqual(mine.rows, [{ position_seconds: 1026, completed: true }]);

// A rider cannot see or forge another rider's progress.
await db.exec(`select set_config('request.jwt.claim.sub', '${riderB}', false);`);
const peek = await db.query<{ n: number }>("select count(*)::int as n from public.academy_progress");
assert.equal(peek.rows[0]?.n, 0, "Progress is private to the rider who made it.");
await assert.rejects(
  db.query("insert into public.academy_progress(user_id, lesson_id, position_seconds) values ($1, $2, 900)", [riderA, lessonId]),
  /row-level security/,
  "A rider must not be able to write progress onto someone else's account."
);

// --- Lesson videos ----------------------------------------------------------

// The host's asset id is recorded by the server when an upload starts. It is
// spliced into a signed URL path, so its shape is a constraint, not a hope.
await db.exec("reset role;");
const bunnyAsset = "8d2c1f3e-4b5a-4c6d-9e7f-1a2b3c4d5e6f";
await db.query("insert into public.academy_videos(lesson_id, provider, asset_id) values ($1, 'bunny', $2)", [lessonId, bunnyAsset]);
await assert.rejects(
  db.query("insert into public.academy_videos(lesson_id, provider, asset_id) values ($1, 'bunny', '../other-lesson')", [draftId]),
  /check constraint/,
  "An asset id that could walk out of its own directory must be refused."
);
await assert.rejects(
  db.query("insert into public.academy_videos(lesson_id, provider, asset_id) values ($1, 'youtube', 'abc')", [draftId]),
  /check constraint/,
  "A provider nothing can sign links for must be refused."
);

// Riders reach a video only through a link the server signs. The catalogue
// is readable by anyone, so the asset id lives where riders cannot read it.
await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${riderA}', false);`);
const videoPeek = await db.query<{ n: number }>("select count(*)::int as n from public.academy_videos");
assert.equal(videoPeek.rows[0]?.n, 0, "A rider must not be able to read a lesson's asset id.");
await assert.rejects(
  db.query("update public.academy_videos set status = 'ready' where lesson_id = $1", [lessonId]),
  /permission denied/,
  "Only the host's webhook marks a video ready."
);

// While the host is still encoding, the answer says so -- the edge function
// turns that into "still being prepared" rather than a dead player.
const encoding = await db.query("select provider, asset_id, status from public.academy_playback_source($1)", [lessonId]);
assert.deepEqual(encoding.rows, [{ provider: "bunny", asset_id: bunnyAsset, status: "processing" }]);

await db.exec(`reset role; update public.academy_videos set status = 'ready' where lesson_id = '${lessonId}';`);
await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${riderB}', false);`);
const watchable = await db.query<{ status: string }>("select status from public.academy_playback_source($1)", [lessonId]);
assert.deepEqual(watchable.rows, [{ status: "ready" }], "Any signed-in rider may watch a published lesson during the founding phase.");

// A draft reads exactly like a lesson that does not exist.
await assert.rejects(
  db.query("select * from public.academy_playback_source($1)", [draftId]),
  /Lesson not found/,
  "A rider must not be able to reach a draft's video."
);
await assert.rejects(
  db.query("select * from public.academy_playback_source($1)", ["20000000-0000-4000-8000-0000000000ff"]),
  /Lesson not found/
);

// Signed-out visitors browse the catalogue but cannot ask for a video.
await db.exec("reset role; set role anon; select set_config('request.jwt.claim.sub', '', false);");
await assert.rejects(
  db.query("select * from public.academy_playback_source($1)", [lessonId]),
  /permission denied/,
  "Watching needs an account."
);

// Staff preview drafts in the admin through the same rule riders use -- but
// only once the session has a verified second factor. With the password alone
// a staff account is a rider account.
const academyStaff = "10000000-0000-4000-8000-000000000031";
const secondFactor = (aal: "aal1" | "aal2" | "") =>
  db.exec(`select set_config('request.jwt.claims', '${aal ? JSON.stringify({ aal }) : ""}', false);`);
await db.exec(`
  reset role;
  insert into auth.users(id, email, raw_user_meta_data) values ('${academyStaff}', 'staff@equina.test', '{"display_name":"Equina Staff"}');
  insert into public.user_roles(user_id, role) values ('${academyStaff}', 'moderator');
  set role authenticated;
  select set_config('request.jwt.claim.sub', '${academyStaff}', false);
`);
await secondFactor("aal1");
await assert.rejects(
  db.query("select * from public.academy_playback_source($1)", [draftId]),
  /Lesson not found/,
  "A staff password without the second factor must not open drafts."
);
const passwordOnlyVideos = await db.query("select status from public.academy_videos");
assert.deepEqual(passwordOnlyVideos.rows, [], "A staff password without the second factor must not read upload state.");
await secondFactor("aal2");
const preview = await db.query("select * from public.academy_playback_source($1)", [draftId]);
assert.deepEqual(preview.rows, [], "Staff may open a draft; with nothing uploaded there is simply nothing to play yet.");
const staffVideos = await db.query<{ status: string }>("select status from public.academy_videos");
assert.deepEqual(staffVideos.rows, [{ status: "ready" }], "Staff see upload state in the admin.");
await secondFactor("");
await db.exec(`select set_config('request.jwt.claim.sub', '${riderA}', false);`);

// Riders browse the catalogue; they do not edit it. Note the shape of the
// defence: RLS filters an UPDATE rather than raising, so the statement
// succeeds having changed nothing. Asserting on an exception here would pass
// for the wrong reason the day the policy disappeared.
await db.query("update public.academy_lessons set title = 'Hijacked' where id = $1", [lessonId]);
await db.exec("reset role;");
const stillNamed = await db.query<{ title: string }>("select title from public.academy_lessons where id = $1", [lessonId]);
assert.equal(stillNamed.rows[0]?.title, "Elastic contact", "Only staff manage the catalogue.");

// Deleting a lesson takes its chapters and everyone's progress with it.
await db.query("delete from public.academy_lessons where id = $1", [lessonId]);
const orphans = await db.query<{ chapters: number; progress: number; videos: number }>(`
  select
    (select count(*)::int from public.academy_chapters where lesson_id = $1) as chapters,
    (select count(*)::int from public.academy_progress where lesson_id = $1) as progress,
    (select count(*)::int from public.academy_videos where lesson_id = $1) as videos
`, [lessonId]);
assert.deepEqual(orphans.rows, [{ chapters: 0, progress: 0, videos: 0 }], "A removed lesson leaves nothing behind.");

// --- Admin console: lessons --------------------------------------------------

// Staff write the catalogue from the admin with their own session. Every
// write below goes through the same grants and policies the console uses.
const asStaff = async (aal: "aal1" | "aal2") => {
  await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub', '${academyStaff}', false);`);
  await secondFactor(aal);
};
const adminLesson = async () => (await db.query<{ id: string; published_at: string | null }>(`
  insert into public.academy_lessons(slug, title, summary, category, discipline, level, access, coach_name)
  values ('half-halts', 'Half-halts that land', 'Asking for balance without losing the go.', 'Dressage', 'dressage', 'beginner', 'free', 'Equina Academy')
  returning id, published_at
`)).rows[0];

await asStaff("aal1");
await assert.rejects(adminLesson(), /row-level security/, "A staff password alone must not write the catalogue.");

await asStaff("aal2");
const created = await adminLesson();
assert.ok(created?.id, "Staff with a second factor create lessons.");
assert.equal(created?.published_at, null, "A new lesson starts as a draft.");
const adminLessonId = created?.id as string;

// Publishing is not a column staff write: it goes through the check below.
await assert.rejects(
  db.query("update public.academy_lessons set published_at = now() where id = $1", [adminLessonId]),
  /permission denied/,
  "published_at moves only through staff_set_lesson_published."
);
await assert.rejects(
  db.query("select public.staff_set_lesson_published($1, true)", [adminLessonId]),
  /length before publishing/,
  "A lesson with no length cannot be published: progress is a share of it."
);
await db.query("update public.academy_lessons set duration_seconds = 840 where id = $1", [adminLessonId]);
await assert.rejects(
  db.query("select public.staff_set_lesson_published($1, true)", [adminLessonId]),
  /finished video/,
  "A lesson with no video cannot be published."
);
await db.exec(`reset role; insert into public.academy_videos(lesson_id, provider, asset_id) values ('${adminLessonId}', 'bunny', 'a1b2c3d4-0000-4000-8000-00000000abcd');`);
await asStaff("aal2");
await assert.rejects(
  db.query("select public.staff_set_lesson_published($1, true)", [adminLessonId]),
  /finished video/,
  "A video still encoding is not a finished video."
);
await db.exec(`reset role; update public.academy_videos set status = 'ready' where lesson_id = '${adminLessonId}';`);
await asStaff("aal2");
const publishedNow = await db.query<{ stamped: string | null }>("select public.staff_set_lesson_published($1, true) as stamped", [adminLessonId]);
assert.ok(publishedNow.rows[0]?.stamped, "A lesson with a length and a ready video publishes.");

// Chapters are saved as one set.
await db.query("select public.staff_save_lesson_chapters($1, $2::jsonb)", [adminLessonId, JSON.stringify([
  { starts_at_seconds: 0, title: "What a half-halt is for" },
  { starts_at_seconds: 300, title: "Timing it with the stride" }
])]);
await assert.rejects(
  db.query("select public.staff_save_lesson_chapters($1, $2::jsonb)", [adminLessonId, JSON.stringify([
    { starts_at_seconds: 0, title: "Kept" },
    { starts_at_seconds: 900, title: "Past the end" }
  ])]),
  /after the lesson ends/,
  "A chapter cannot start after the lesson ends."
);
await assert.rejects(
  db.query("select public.staff_save_lesson_chapters($1, $2::jsonb)", [adminLessonId, JSON.stringify([
    { starts_at_seconds: 60, title: "Twice" },
    { starts_at_seconds: 60, title: "Twice again" }
  ])]),
  /duplicate key/,
  "Two chapters cannot start at the same second."
);
const savedChapters = await db.query<{ title: string }>(
  "select title from public.academy_chapters where lesson_id = $1 order by starts_at_seconds", [adminLessonId]
);
assert.deepEqual(savedChapters.rows.map((row) => row.title), ["What a half-halt is for", "Timing it with the stride"],
  "A refused save must leave the chapters as they were.");

// Riders now see it, chapters and all.
await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub', '${riderB}', false);`);
const riderSees = await db.query<{ chapters: number }>(`
  select (select count(*)::int from public.academy_chapters where lesson_id = $1) as chapters
  from public.academy_lessons where id = $1
`, [adminLessonId]);
assert.deepEqual(riderSees.rows, [{ chapters: 2 }], "A published lesson and its chapters reach riders.");
await assert.rejects(
  db.query("select public.staff_set_lesson_published($1, false)", [adminLessonId]),
  /Staff access required/,
  "Riders cannot unpublish lessons."
);
await assert.rejects(
  db.query("select public.staff_save_lesson_chapters($1, '[]'::jsonb)", [adminLessonId]),
  /Staff access required/,
  "Riders cannot rewrite chapters."
);

// Deleting is for drafts: riders may already have progress on a published one.
await asStaff("aal2");
await db.query("delete from public.academy_lessons where id = $1", [adminLessonId]);
await db.exec("reset role;");
assert.equal((await db.query("select id from public.academy_lessons where id = $1", [adminLessonId])).rows.length, 1,
  "A published lesson must not be deletable.");
await asStaff("aal2");
assert.equal((await db.query<{ stamped: string | null }>(
  "select public.staff_set_lesson_published($1, false) as stamped", [adminLessonId]
)).rows[0]?.stamped, null, "Unpublishing returns the lesson to draft.");
await db.query("delete from public.academy_lessons where id = $1", [adminLessonId]);
await db.exec("reset role;");
assert.equal((await db.query("select id from public.academy_lessons where id = $1", [adminLessonId])).rows.length, 0,
  "A draft can be deleted.");

// --- Lesson videos on Mux -----------------------------------------------------

// Staff upload from the admin straight to Mux. The row follows the upload:
// uploading, processing once Mux has the file, ready with a playback id.
const muxLesson = (await db.query<{ id: string }>(`
  insert into public.academy_lessons(slug, title, summary, category, access)
  values ('canter-transitions', 'Canter transitions without the rush', 'Prepare, ask, and let it happen.', 'Dressage', 'free')
  returning id
`)).rows[0]?.id as string;
await db.query("insert into public.academy_videos(lesson_id, provider, upload_id, status) values ($1, 'mux', 'upload1', 'uploading')", [muxLesson]);

const videoRefusals: Array<[string, unknown[], string]> = [
  ["update public.academy_videos set status = 'ready' where lesson_id = $1", [muxLesson], "A Mux video is not ready without a playback id."],
  ["update public.academy_videos set upload_id = null where lesson_id = $1", [muxLesson], "A video row must name its upload or its asset."],
  ["update public.academy_videos set playback_id = 'abc/../x' where lesson_id = $1", [muxLesson], "A playback id is spliced into URLs; its shape is a constraint."],
  ["update public.academy_videos set status = 'queued' where lesson_id = $1", [muxLesson], "Only the known statuses exist."],
  ["update public.academy_videos set provider = 'vimeo' where lesson_id = $1", [muxLesson], "Only hosts that links can be signed for."]
];
for (const [statement, values, message] of videoRefusals) {
  await assert.rejects(db.query(statement, values), /check constraint/, message);
}

// Opening an upload or removing a video asks the database first.
await asStaff("aal2");
await db.query("select public.staff_prepare_lesson_video($1)", [muxLesson]);
await assert.rejects(
  db.query("select public.staff_prepare_lesson_video($1)", ["20000000-0000-4000-8000-0000000000fe"]),
  /Lesson not found/
);
await asStaff("aal1");
await assert.rejects(
  db.query("select public.staff_prepare_lesson_video($1)", [muxLesson]),
  /Staff access required/,
  "A staff password alone must not open an upload."
);
await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub', '${riderB}', false);`);
await secondFactor("");
await assert.rejects(db.query("select public.staff_prepare_lesson_video($1)", [muxLesson]), /Staff access required/,
  "Riders must not open uploads.");

// Ready, the playback id is what links are signed for.
await db.exec(`
  reset role;
  update public.academy_videos set asset_id = 'asset1', playback_id = 'signed1', status = 'ready' where lesson_id = '${muxLesson}';
  update public.academy_lessons set duration_seconds = 866 where id = '${muxLesson}';
`);
await asStaff("aal2");
await db.query("select public.staff_set_lesson_published($1, true)", [muxLesson]);
await assert.rejects(
  db.query("select public.staff_prepare_lesson_video($1)", [muxLesson]),
  /Unpublish the lesson before changing its video/,
  "A published lesson keeps its video: riders could not play it while a new one encodes."
);
await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub', '${riderB}', false);`);
await secondFactor("");
const muxSource = await db.query("select provider, asset_id, playback_id, status from public.academy_playback_source($1)", [muxLesson]);
assert.deepEqual(muxSource.rows, [{ provider: "mux", asset_id: "asset1", playback_id: "signed1", status: "ready" }],
  "A rider's playback source names the playback id to sign.");
assert.deepEqual((await db.query("select lesson_id from public.academy_videos")).rows, [],
  "Riders still never read a video's ids.");
await asStaff("aal2");
await db.query("select public.staff_set_lesson_published($1, false)", [muxLesson]);
await db.query("delete from public.academy_lessons where id = $1", [muxLesson]);
await db.exec("reset role;");

// Signed-out visitors cannot reach any staff function.
await db.exec("set role anon; select set_config('request.jwt.claim.sub', '', false);");
for (const call of [
  "select public.staff_set_lesson_published(gen_random_uuid(), true)",
  "select public.staff_save_lesson_chapters(gen_random_uuid(), '[]'::jsonb)",
  "select * from public.staff_moderation_queue()",
  "select public.staff_moderate_content('post', gen_random_uuid(), 'remove')",
  "select public.staff_prepare_lesson_video(gen_random_uuid())"
]) {
  await assert.rejects(db.query(call), /permission denied/, `anon must not call: ${call}`);
}
await secondFactor("");
await db.exec("reset role;");

// --- Client write grants ----------------------------------------------------

await db.exec("reset role;");

// Every write a client role holds, exactly as the database grants it: a bare
// table is a table-level grant, a column list is a column grant. The harness
// creates tables the way hosted Supabase does, writable by anon and
// authenticated, so a new table fails here until a migration says what
// clients may write to it. 202610020004 is where this list comes from.
type ClientWrites = { insert?: string[] | "table"; update?: string[] | "table"; delete?: true };
const staffManaged: ClientWrites = { insert: "table", update: "table", delete: true };
// Written by staff from the admin console (admin/), not by the app. Publishing
// is the column left out: it goes through staff_set_lesson_published.
const lessonColumns = ["slug", "title", "summary", "category", "discipline", "level", "access", "duration_seconds",
  "coach_name", "coach_title", "poster_path", "position"];
const adminWrittenTables = new Set(["academy_lessons"]);
const clientWrites: Record<string, ClientWrites> = {
  academy_chapters: staffManaged,
  academy_lessons: { insert: lessonColumns, update: lessonColumns, delete: true },
  academy_progress: {
    insert: ["user_id", "lesson_id", "position_seconds", "completed_at", "last_seen_at"],
    update: ["user_id", "lesson_id", "position_seconds", "completed_at", "last_seen_at"],
    delete: true
  },
  app_feature_flags: staffManaged,
  club_comments: { insert: ["post_id", "author_id", "parent_id", "body"], update: ["body"], delete: true },
  club_memberships: { insert: ["space_id", "user_id", "role"], update: ["space_id", "user_id", "role"], delete: true },
  club_posts: { insert: ["author_id", "space_id", "post_type", "body", "horse_id", "ride_id"], update: ["body"] },
  club_reactions: { insert: ["post_id", "user_id", "reaction"], update: ["post_id", "user_id", "reaction"], delete: true },
  coach_credit_policies: staffManaged,
  coach_message_feedback: {
    insert: ["user_id", "message_id", "useful", "reason"],
    update: ["user_id", "message_id", "useful", "reason"],
    delete: true
  },
  content_reports: { insert: ["reporter_id", "post_id", "comment_id", "reported_user_id", "reason", "detail"], update: "table" },
  horse_collaborators: { update: ["accepted_at"], delete: true },
  horse_records: {
    insert: ["horse_id", "created_by", "record_type", "status", "title", "occurred_on", "due_on", "provider_name", "notes", "source", "details"],
    update: ["status", "title", "occurred_on", "due_on", "provider_name", "notes", "source", "details"]
  },
  horses: {
    insert: ["owner_id", "name", "breed", "discipline", "birth_date", "sex", "height_cm", "is_primary", "archived_at"],
    update: ["name", "breed", "discipline", "birth_date", "sex", "height_cm", "is_primary", "archived_at"]
  },
  listing_risk_signals: staffManaged,
  listing_shipping_rates: {
    insert: ["listing_id", "country_code", "service_name", "amount_minor", "min_days", "max_days", "tracked", "insured_up_to_minor"],
    update: ["listing_id", "country_code", "service_name", "amount_minor", "min_days", "max_days", "tracked", "insured_up_to_minor"],
    delete: true
  },
  listings: {
    insert: ["seller_id", "category", "title", "description", "brand_name", "model", "condition_grade", "price_minor", "currency", "country_code", "locality", "metadata", "status"],
    update: ["category", "title", "description", "brand_name", "model", "condition_grade", "price_minor", "currency", "country_code", "locality", "metadata"]
  },
  marketplace_conversations: { update: ["buyer_archived_at", "seller_archived_at"] },
  marketplace_messages: { insert: ["conversation_id", "sender_id", "client_nonce", "body"], update: ["delivery_status", "read_at", "deleted_at"] },
  marketplace_reports: { insert: ["reporter_id", "listing_id", "message_id", "reported_user_id", "reason", "detail"], update: "table" },
  marketplace_reviews: { insert: ["order_id", "reviewer_id", "reviewee_id", "rating", "body"] },
  moderation_actions: staffManaged,
  notification_preferences: {
    insert: ["user_id", "human_messages", "order_changes", "horse_reminders", "academy_reminders", "message_previews", "quiet_hours_timezone", "quiet_hours_start", "quiet_hours_end"],
    update: ["human_messages", "order_changes", "horse_reminders", "academy_reminders", "message_previews", "quiet_hours_timezone", "quiet_hours_start", "quiet_hours_end"]
  },
  profiles: { update: ["display_name", "locale", "location", "discipline", "skill_level", "bio"] },
  ride_entries: {
    insert: ["rider_id", "horse_id", "discipline", "focus", "planned_duration", "started_at", "completed_at", "elapsed_seconds", "completed_phases", "total_phases", "mood", "rider_note"],
    update: ["focus", "mood", "rider_note", "elapsed_seconds", "completed_phases"],
    delete: true
  },
  saved_listings: { insert: ["user_id", "listing_id"], update: ["user_id", "listing_id"], delete: true },
  user_blocks: { insert: ["blocker_id", "blocked_id"], update: ["blocker_id", "blocked_id"], delete: true },
  user_preferences: {
    insert: ["user_id", "academy_discipline", "academy_level", "academy_focus", "use_rider_profile", "use_selected_horse", "use_ride_history", "reduced_personalization"],
    update: ["academy_discipline", "academy_level", "academy_focus", "use_rider_profile", "use_selected_horse", "use_ride_history", "reduced_personalization"]
  },
  user_sanctions: { update: "table" }
};
const describeGrant = (table: string, privilege: string, columns: string[] | "table") =>
  `authenticated ${privilege} ${table}${columns === "table" ? "" : `(${[...columns].sort().join(",")})`}`;
const expectedGrants = Object.entries(clientWrites).flatMap(([table, writes]) => [
  ...(writes.insert ? [describeGrant(table, "INSERT", writes.insert)] : []),
  ...(writes.update ? [describeGrant(table, "UPDATE", writes.update)] : []),
  ...(writes.delete ? [describeGrant(table, "DELETE", "table")] : [])
]).sort();

const tableGrants = await db.query<{ role: string; privilege: string; table_name: string }>(`
  select r.role, p.privilege, c.relname as table_name
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join (values ('anon'), ('authenticated')) r(role)
  cross join (values ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')) p(privilege)
  where n.nspname = 'public' and c.relkind = 'r' and has_table_privilege(r.role, c.oid, p.privilege)
`);
const columnGrants = await db.query<{ role: string; privilege: string; table_name: string; columns: string }>(`
  select r.role, p.privilege, c.relname as table_name, string_agg(a.attname, ',' order by a.attname) as columns
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
  cross join (values ('anon'), ('authenticated')) r(role)
  cross join (values ('INSERT'), ('UPDATE'), ('REFERENCES')) p(privilege)
  where n.nspname = 'public' and c.relkind = 'r'
    and not has_table_privilege(r.role, c.oid, p.privilege)
    and has_column_privilege(r.role, c.oid, a.attnum, p.privilege)
  group by 1, 2, 3
`);
const actualGrants = [
  ...tableGrants.rows.map((grant) => `${grant.role} ${grant.privilege} ${grant.table_name}`),
  ...columnGrants.rows.map((grant) => `${grant.role} ${grant.privilege} ${grant.table_name}(${grant.columns})`)
].sort();
assert.deepEqual(actualGrants, expectedGrants, "Client roles must hold exactly the writes listed above, and anon none at all.");

const clientSequences = await db.query<{ sequence_name: string }>(`
  select c.relname as sequence_name
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'S'
    and (has_sequence_privilege('anon', c.oid, 'USAGE, UPDATE') or has_sequence_privilege('authenticated', c.oid, 'USAGE, UPDATE'))
`);
assert.deepEqual(clientSequences.rows, [], "Every sequence backs a server-written table; clients must not advance or reset one.");

// Every write the app makes directly must be one the grants allow, so a column
// added to a repository payload fails here rather than as "permission denied"
// in the app.
// A PostgREST upsert sends ON CONFLICT DO UPDATE SET for every column in its
// payload, so it needs INSERT and UPDATE on all of them.
const objectKeys = (source: string, open: number) => {
  const entries: string[] = [];
  let entry = "";
  let depth = 0;
  let quote = "";
  for (let index = open; index < source.length; index += 1) {
    const char = source[index] as string;
    if (quote) {
      if (char === quote && source[index - 1] !== "\\") quote = "";
    } else if (char === "\"" || char === "'" || char === "`") {
      quote = char;
    } else if ("{[(".includes(char)) {
      depth += 1;
      if (depth === 1) continue;
    } else if ("}])".includes(char)) {
      depth -= 1;
      if (depth === 0) {
        entries.push(entry);
        break;
      }
    } else if (char === "," && depth === 1) {
      entries.push(entry);
      entry = "";
      continue;
    }
    entry += char;
  }
  return entries.filter((value) => value.trim()).map((value) => {
    const key = /^\s*(\w+)\s*(?::|$)/.exec(value)?.[1];
    if (!key) throw new Error(`Cannot read a column from payload entry "${value.trim()}".`);
    return key;
  });
};
const payloadColumns = (source: string, argumentStart: number) => {
  if (source.slice(argumentStart).trimStart().startsWith("{")) return objectKeys(source, source.indexOf("{", argumentStart));
  // A named payload: built up as payload.column = ..., or declared as an object.
  const name = /^\s*(\w+)/.exec(source.slice(argumentStart))?.[1] ?? "";
  const method = source.slice(source.lastIndexOf("\n  async ", argumentStart), argumentStart);
  const assigned = [...method.matchAll(new RegExp(`\\b${name}\\.(\\w+)\\s*=(?!=)`, "g"))].map((match) => match[1] as string);
  const declared = new RegExp(`const ${name} = ([^;]*);`).exec(method)?.[1] ?? "";
  const columns = [...assigned, ...[...declared.matchAll(/(\w+)\s*:/g)].map((match) => match[1] as string)];
  if (!columns.length) throw new Error(`Cannot find the columns written through "${name}".`);
  return columns;
};
const backendDirectory = join(process.cwd(), "src", "backend");
const writtenTables = new Set<string>();
const ungrantedWrites: string[] = [];
for (const fileName of readdirSync(backendDirectory).filter((name) => name.endsWith("-repository.ts")).sort()) {
  const source = readFileSync(join(backendDirectory, fileName), "utf8");
  for (const call of source.matchAll(/\.from\("(\w+)"\)\s*\.(insert|update|upsert|delete)\(/g)) {
    const [, table = "", verb = ""] = call;
    writtenTables.add(table);
    const columns = verb === "delete" ? [] : payloadColumns(source, call.index + call[0].length);
    for (const privilege of verb === "upsert" ? ["INSERT", "UPDATE"] : [verb.toUpperCase()]) {
      if (privilege === "DELETE") {
        const allowed = await db.query<{ allowed: boolean }>(
          "select has_table_privilege('authenticated', $1, 'DELETE') as allowed", [`public.${table}`]
        );
        if (!allowed.rows[0]?.allowed) ungrantedWrites.push(`${fileName}: DELETE ${table}`);
        continue;
      }
      for (const column of columns) {
        const allowed = await db.query<{ allowed: boolean }>(
          "select has_column_privilege('authenticated', $1, $2, $3) as allowed", [`public.${table}`, column, privilege]
        );
        if (!allowed.rows[0]?.allowed) ungrantedWrites.push(`${fileName}: ${privilege} ${table}.${column}`);
      }
    }
  }
}
assert.deepEqual(ungrantedWrites, [], "Every column the app writes directly must be granted to authenticated.");
const clientWrittenTables = Object.entries(clientWrites)
  .filter(([table, writes]) => !adminWrittenTables.has(table) && (Array.isArray(writes.insert) || Array.isArray(writes.update)))
  .map(([table]) => table);
assert.deepEqual([...writtenTables].sort(), clientWrittenTables.sort(),
  "Column grants must match tables the app actually writes; drop a grant when its last writer goes.");

// What those grants close. Privileges are checked before RLS, so each of these
// fails the same way whichever row it would have matched.
await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${riderA}', false);`);
const refusedWrites: Array<[string, string]> = [
  ["update public.club_posts set moderation_status = 'visible'", "An author must not republish a post moderation hid."],
  ["update public.club_comments set moderation_status = 'visible'", "An author must not republish a comment moderation hid."],
  ["update public.club_posts set space_id = space_id", "A post must not move into a space its author cannot read."],
  [`insert into public.club_posts(author_id, space_id, post_type, body, created_at)
    values (auth.uid(), gen_random_uuid(), 'journal', 'Pinned', '2099-01-01')`, "A post's place in the feed must not be chosen by its author."],
  ["delete from public.club_posts", "Post deletion goes through delete-club-post, which also removes media."],
  ["update public.horse_records set created_by = auth.uid()", "A record's author must not be rewritten."],
  ["update public.listings set published_at = now()", "Publication belongs to the moderation pipeline."],
  ["update public.listings set status = 'draft'", "Listing status moves only through publish and archive."],
  [`insert into public.content_reports(reporter_id, reported_user_id, assigned_to)
    values (auth.uid(), gen_random_uuid(), auth.uid())`, "A reporter must not assign their own report."],
  [`insert into public.marketplace_reviews(order_id, reviewer_id, reviewee_id, rating, verified)
    values (gen_random_uuid(), auth.uid(), gen_random_uuid(), 5, true)`, "A review's verification is not the reviewer's to set."],
  [`insert into public.marketplace_messages(conversation_id, sender_id, client_nonce, body, read_at)
    values (gen_random_uuid(), auth.uid(), gen_random_uuid(), 'Seen', now())`, "A sender must not mark their own message read."],
  ["update public.user_preferences set version = version", "The preferences version is bumped by trigger only."],
  ["truncate public.ride_entries", "TRUNCATE skips RLS entirely; no client may hold it."]
];
for (const [statement, message] of refusedWrites) {
  await assert.rejects(db.query(statement), /permission denied/, message);
}
await db.exec("reset role; set role anon; select set_config('request.jwt.claim.sub', '', false);");
for (const statement of [
  "insert into public.profiles(id, display_name) values (gen_random_uuid(), 'Anonymous')",
  "update public.listings set title = title",
  "delete from public.saved_listings"
]) {
  await assert.rejects(db.query(statement), /permission denied/, `anon must not write: ${statement}`);
}

// The statement supabase-js sends for .upsert(row). It needs the UPDATE grant
// even when nothing conflicts; running it twice also takes the DO UPDATE path.
const upsert = (table: string, row: Record<string, unknown>, conflict: string) => {
  const columns = Object.keys(row);
  return db.query(`
    insert into public.${table}(${columns.join(", ")})
    values (${columns.map((_, index) => `$${index + 1}`).join(", ")})
    on conflict (${conflict}) do update set ${columns.map((column) => `${column} = excluded.${column}`).join(", ")}
  `, Object.values(row));
};
await db.exec("reset role;");
// Reacting needs a visible post; under post-moderation it already is.
assert.equal(
  (await db.query<{ status: string }>("select moderation_status::text as status from public.club_posts where id = $1", [postId])).rows[0]?.status,
  "visible"
);
const upsertLesson = await db.query<{ id: string }>(`
  insert into public.academy_lessons(slug, title, summary, category, published_at)
  values ('seat-basics', 'A quieter seat', 'Sitting still so the horse can move.', 'Flatwork', now())
  returning id
`);
await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${riderC}', false);`);
for (const reaction of ["like", "support"]) {
  await upsert("saved_listings", { user_id: riderC, listing_id: listingId }, "user_id, listing_id");
  await upsert("user_blocks", { blocker_id: riderC, blocked_id: riderB }, "blocker_id, blocked_id");
  await upsert("club_reactions", { post_id: postId, user_id: riderC, reaction }, "post_id, user_id");
}
// No UPDATE policy on memberships: a first join must work, a repeat through
// the DO UPDATE path is refused, and the app's join (DO NOTHING) succeeds on a
// membership already held instead of telling the rider Club is closed.
await upsert("club_memberships", { space_id: spaceId, user_id: riderC, role: "member" }, "space_id, user_id");
await assert.rejects(
  upsert("club_memberships", { space_id: spaceId, user_id: riderC, role: "member" }, "space_id, user_id"),
  /row-level security/,
  "The UPDATE grant on memberships exists only so the upsert plans; RLS still refuses the update."
);
await db.query(
  "insert into public.club_memberships(space_id, user_id, role) values ($1, $2, 'member') on conflict (space_id, user_id) do nothing",
  [spaceId, riderC]
);
const repeatedJoin = await db.query("select 1 from public.club_memberships where space_id = $1 and user_id = $2", [spaceId, riderC]);
assert.equal(repeatedJoin.rows.length, 1, "Joining a group held already keeps the one row and raises nothing.");
await db.exec(`select set_config('request.jwt.claim.sub', '${riderA}', false);`);
await upsert("coach_message_feedback", {
  user_id: riderA, message_id: coachAssistantMessage.rows[0]?.id, useful: false, reason: "Too general"
}, "user_id, message_id");
for (const position of [60, 600]) {
  await upsert("academy_progress", {
    user_id: riderA, lesson_id: upsertLesson.rows[0]?.id, position_seconds: position,
    completed_at: null, last_seen_at: new Date().toISOString()
  }, "user_id, lesson_id");
}
const upsertDraft = await db.query<{ id: string }>(`
  insert into public.listings(seller_id, category, title, description, brand_name, condition_grade, price_minor, currency, country_code, locality, metadata, status)
  values ($1, 'pad', 'Dressage square pad navy', 'Light wear on the girth straps.', 'Equiline', 'good', 6500, 'EUR', 'DE', 'Aachen', '{}', 'draft')
  returning id
`, [riderA]);
for (const amount of [900, 1100]) {
  await upsert("listing_shipping_rates", {
    listing_id: upsertDraft.rows[0]?.id, country_code: "DE", service_name: "DHL Paket", amount_minor: amount,
    min_days: 1, max_days: 3, tracked: true, insured_up_to_minor: 50000
  }, "listing_id, country_code, service_name");
}
await db.exec("reset role;");
const upserted = await db.query<{ saved: number; reaction: string; useful: boolean; position: number; rate: number }>(`
  select
    (select count(*)::int from public.saved_listings where user_id = $1) as saved,
    (select reaction::text from public.club_reactions where user_id = $1 and post_id = $2) as reaction,
    (select useful from public.coach_message_feedback where user_id = $3 and message_id = $4) as useful,
    (select position_seconds from public.academy_progress where user_id = $3 and lesson_id = $5) as position,
    (select amount_minor from public.listing_shipping_rates where listing_id = $6) as rate
`, [riderC, postId, riderA, coachAssistantMessage.rows[0]?.id, upsertLesson.rows[0]?.id, upsertDraft.rows[0]?.id]);
assert.deepEqual(upserted.rows[0], { saved: 1, reaction: "support", useful: false, position: 600, rate: 1100 },
  "Client upserts must still insert and then update under the column grants.");

// Club post-moderation: content is visible as soon as it is written; the
// phrase filter, three reports and blocking are what stand between it and
// other riders.
const riderD = "10000000-0000-4000-8000-000000000004";
const riderE = "10000000-0000-4000-8000-000000000005";
await db.exec(`
  reset role;
  insert into auth.users(id, email, raw_user_meta_data) values
    ('${riderD}', 'rider-d@equina.test', '{"display_name":"Rider D"}'),
    ('${riderE}', 'rider-e@equina.test', '{"display_name":"Rider E"}');
`);
const asRider = (rider: string) =>
  db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub', '${rider}', false);`);
const statusOf = async (table: "club_posts" | "club_comments", id: string) =>
  (await db.query<{ status: string }>(`select moderation_status::text as status from public.${table} where id = $1`, [id]))
    .rows[0]?.status;

await asRider(riderC);
const openPost = (await db.query<{ id: string; status: string }>(`
  insert into public.club_posts(author_id, space_id, post_type, body)
  values ($1, $2, 'ride', 'Rhythm work over poles, then one calm line.') returning id, moderation_status::text as status
`, [riderC, spaceId])).rows[0];
assert.equal(openPost?.status, "visible", "A post must be visible to other riders as soon as it is written.");
const filteredPost = (await db.query<{ id: string; status: string }>(`
  insert into public.club_posts(author_id, space_id, post_type, body)
  values ($1, $2, 'journal', 'DM me for a crypto investment that pays for your horse.') returning id, moderation_status::text as status
`, [riderC, spaceId])).rows[0];
assert.equal(filteredPost?.status, "hidden", "The phrase filter must hide matching posts on write.");
await db.query("update public.club_posts set body = 'Nothing to see here.' where id = $1", [filteredPost?.id]);
await db.exec("reset role;");
assert.equal(await statusOf("club_posts", filteredPost?.id ?? ""), "hidden", "Editing a hidden post must not republish it.");

await asRider(riderA);
const openComment = (await db.query<{ id: string; status: string }>(`
  insert into public.club_comments(post_id, author_id, body)
  values ($1, $2, 'Lovely rhythm. What distance were the poles?') returning id, moderation_status::text as status
`, [openPost?.id, riderA])).rows[0];
assert.equal(openComment?.status, "visible", "A comment must be visible as soon as it is written.");

for (const [index, reporter] of [riderA, riderD, riderE].entries()) {
  await asRider(reporter);
  await db.query(
    "insert into public.content_reports(reporter_id, post_id, reason) values ($1, $2, 'spam')",
    [reporter, openPost?.id]
  );
  await db.exec("reset role;");
  assert.equal(
    await statusOf("club_posts", openPost?.id ?? ""),
    index < 2 ? "visible" : "hidden",
    index < 2 ? "Fewer than three reports must leave a post up." : "Three different reporters must hide a post."
  );
}

await asRider(riderC);
await db.query("insert into public.user_blocks(blocker_id, blocked_id) values ($1, $2)", [riderC, riderA]);
const blockedComments = await db.query("select id from public.club_comments where id = $1", [openComment?.id]);
assert.equal(blockedComments.rows.length, 0, "A blocked rider's comments must be hidden from the rider who blocked them.");
await asRider(riderA);
const blockerPost = await db.query("select id from public.club_posts where author_id = $1", [riderC]);
assert.equal(blockerPost.rows.length, 0, "A blocked rider must not see the blocker's posts either.");
await db.exec("reset role;");

// --- Admin console: moderation queue -----------------------------------------

type QueueItem = { content_type: string; content_id: string; status: string; open_reports: number; reasons: string[]; author_name: string };
const queue = async () => (await db.query<QueueItem>(
  "select content_type, content_id, status::text as status, open_reports, reasons, author_name from public.staff_moderation_queue()"
)).rows;
const queued = async (id: string | undefined) => (await queue()).find((item) => item.content_id === id);

await asRider(riderA);
await assert.rejects(queue(), /Staff access required/, "Riders must not read the moderation queue.");
await asStaff("aal1");
await assert.rejects(queue(), /Staff access required/, "A staff password alone must not read the moderation queue.");
await assert.rejects(
  db.query("select public.staff_moderate_content('post', $1, 'restore')", [openPost?.id]),
  /Staff access required/,
  "A staff password alone must not moderate."
);

await asStaff("aal2");
const reportedItem = await queued(openPost?.id);
assert.deepEqual(
  reportedItem && { status: reportedItem.status, open_reports: reportedItem.open_reports, reasons: reportedItem.reasons, author: reportedItem.author_name },
  { status: "hidden", open_reports: 3, reasons: ["spam"], author: "Rider C" },
  "A post hidden by three reports waits for staff, with who wrote it and why it was reported."
);
assert.equal((await queued(filteredPost?.id))?.open_reports, 0, "A post the filter hid waits for staff too.");
assert.equal(await queued(openComment?.id), undefined, "A visible comment nobody reported is not queued.");

await assert.rejects(
  db.query("select public.staff_moderate_content('post', $1, 'ban')", [openPost?.id]),
  /restore or remove/
);
await assert.rejects(
  db.query("select public.staff_moderate_content('post', gen_random_uuid(), 'remove')"),
  /no longer exists/
);

// Restoring settles the reports, and only new reports count from then on.
await db.query("select public.staff_moderate_content('post', $1, 'restore', 'Poles are a training aid, not spam.')", [openPost?.id]);
await db.exec("reset role;");
assert.equal(await statusOf("club_posts", openPost?.id ?? ""), "visible", "Restoring puts the post back in the feed.");
const settled = await db.query<{ status: string }>(
  "select distinct status::text as status from public.content_reports where post_id = $1", [openPost?.id]
);
assert.deepEqual(settled.rows, [{ status: "dismissed" }], "Restoring dismisses the reports it answered.");
const restoreRecord = await db.query<{ action: string; moderator_id: string; notes: string }>(
  "select action, moderator_id, notes from public.moderation_actions where target_id = $1", [openPost?.id]
);
assert.deepEqual(restoreRecord.rows, [{ action: "approve", moderator_id: academyStaff, notes: "Poles are a training aid, not spam." }],
  "Every decision records who made it.");

// Rider D reported it before; that report was answered, so they may again.
await asRider(riderD);
await db.query("insert into public.content_reports(reporter_id, post_id, reason) values ($1, $2, 'harassment')", [riderD, openPost?.id]);
await db.exec("reset role;");
assert.equal(await statusOf("club_posts", openPost?.id ?? ""), "visible",
  "Reports staff already answered must not count toward hiding the post again.");
await asStaff("aal2");
assert.deepEqual((await queued(openPost?.id))?.open_reports, 1, "A new report brings the post back to the queue.");

// Removing keeps it hidden and takes it off the queue for good.
await db.query("select public.staff_moderate_content('post', $1, 'remove')", [openPost?.id]);
await db.query("select public.staff_moderate_content('post', $1, 'remove')", [filteredPost?.id]);
await db.query("select public.staff_moderate_content('comment', $1, 'remove')", [openComment?.id]);
assert.equal(await queued(openPost?.id), undefined, "A removed post leaves the queue.");
assert.equal(await queued(filteredPost?.id), undefined, "A filtered post staff confirmed leaves the queue.");
await db.exec("reset role;");
assert.deepEqual(
  [await statusOf("club_posts", openPost?.id ?? ""), await statusOf("club_posts", filteredPost?.id ?? ""), await statusOf("club_comments", openComment?.id ?? "")],
  ["hidden", "hidden", "hidden"],
  "Removed content stays out of the feed."
);
assert.deepEqual(
  (await db.query<{ status: string }>(
    "select status::text as status from public.content_reports where post_id = $1 and reporter_id = $2 order by created_at", [openPost?.id, riderD]
  )).rows,
  [{ status: "dismissed" }, { status: "actioned" }],
  "Removing actions the reports it answered and leaves earlier decisions as they were."
);

// Feature flags are an admin power and need the second factor like the rest.
await db.exec(`reset role; insert into public.user_roles(user_id, role) values ('${academyStaff}', 'admin');`);
await asStaff("aal1");
await db.query("update public.app_feature_flags set note = 'Changed with a password' where key = 'academy_progress'");
await db.exec("reset role;");
assert.notEqual(
  (await db.query<{ note: string }>("select note from public.app_feature_flags where key = 'academy_progress'")).rows[0]?.note,
  "Changed with a password",
  "An admin password alone must not change flags."
);
await asStaff("aal2");
await db.query("update public.app_feature_flags set note = 'Changed with a second factor' where key = 'academy_progress'");
await secondFactor("");
await db.exec("reset role;");
assert.equal(
  (await db.query<{ note: string }>("select note from public.app_feature_flags where key = 'academy_progress'")).rows[0]?.note,
  "Changed with a second factor",
  "An admin session with a second factor changes flags."
);

// --- Plans ------------------------------------------------------------------

type PlanState = {
  enforced: boolean;
  tier: string;
  status: string | null;
  source: string | null;
  clubAccess: string;
  academy: { picksLimit: number | null; picksUsed: number; openPicks: string[] };
  tiers: Array<{ key: string; name: string }>;
};
const myPlan = async () =>
  (await db.query<{ plan: PlanState }>("select public.my_plan() as plan")).rows[0]?.plan as PlanState;
const pickLesson = (lesson: string) =>
  db.query<{ plan: PlanState }>("select public.pick_academy_lesson($1) as plan", [lesson]);
const watchLesson = (lesson: string) =>
  db.query<{ status: string }>("select status from public.academy_playback_source($1)", [lesson]);
const readsPost = async (post: string) =>
  (await db.query("select id from public.club_posts where id = $1", [post])).rows.length === 1;
// PT402 is what PostgREST turns into HTTP 402: the app shows the plans, not an error.
const paywall = (pattern: RegExp) => (error: unknown) =>
  error instanceof Error && (error as { code?: string }).code === "PT402" && pattern.test(error.message);

await db.exec("reset role;");

// Ilinca's three plans, as rows the admin changes without a migration.
const planTiers = await db.query(`
  select tier.key, tier.name, tier.academy_picks, tier.club_access, tier.coach_sessions,
         tier.event_tickets, tier.trial_days, policy.monthly_credits
  from public.plan_tiers tier
  join public.coach_credit_policies policy on policy.key = tier.key
  order by tier.rank
`);
assert.deepEqual(planTiers.rows, [
  { key: "free", name: "Free", academy_picks: 2, club_access: "none", coach_sessions: 0, event_tickets: 0, trial_days: 0, monthly_credits: 15 },
  { key: "mid", name: "Plus", academy_picks: 30, club_access: "post", coach_sessions: 1, event_tickets: 0, trial_days: 7, monthly_credits: 100 },
  { key: "premium", name: "Premium", academy_picks: null, club_access: "post", coach_sessions: 2, event_tickets: 1, trial_days: 7, monthly_credits: 300 }
]);

// Four paid lessons and a free one, all with finished videos, and a Club post
// from a rider plans never touch.
const planLessons: string[] = [];
for (const [slug, access] of [
  ["plan-seat", "paid"], ["plan-canter", "paid"], ["plan-grid", "paid"], ["plan-rein-back", "paid"], ["plan-grooming", "free"]
] as const) {
  const row = await db.query<{ id: string }>(`
    insert into public.academy_lessons(slug, title, summary, category, access, duration_seconds, published_at)
    values ($1, $1, 'A lesson for the plan tests.', 'Dressage', $2, 600, now()) returning id
  `, [slug, access]);
  const id = row.rows[0]?.id as string;
  await db.query("insert into public.academy_videos(lesson_id, provider, asset_id, status) values ($1, 'bunny', $2, 'ready')", [id, `asset-${slug}`]);
  planLessons.push(id);
}
const [seatLesson, canterLesson, gridLesson, reinBackLesson, groomingLesson] = planLessons as [string, string, string, string, string];

await asRider(riderC);
const plansPost = (await db.query<{ id: string }>(`
  insert into public.club_posts(author_id, space_id, post_type, body)
  values ($1, $2, 'ride', 'Hacked out on the buckle today.') returning id
`, [riderC, spaceId])).rows[0]?.id as string;

// The founding phase: with plans off, every rider has every lesson and the
// whole Club, and picking spends nothing.
await asRider(riderD);
const founding = await myPlan();
assert.deepEqual(
  { enforced: founding.enforced, tier: founding.tier, clubAccess: founding.clubAccess },
  { enforced: false, tier: "free", clubAccess: "post" }
);
assert.deepEqual(founding.tiers.map((tier) => tier.name), ["Free", "Plus", "Premium"], "The plan screen reads every plan in one call.");
assert.deepEqual((await watchLesson(seatLesson)).rows, [{ status: "ready" }], "While plans are off, every rider watches paid lessons.");
await pickLesson(seatLesson);
assert.equal((await myPlan()).academy.picksUsed, 0, "A pick is not spent while every lesson is open.");
assert.ok(await readsPost(plansPost), "While plans are off, every rider reads the Club.");

// On for one account first: that is how staff try Free before anyone else.
await db.exec(`reset role; insert into public.feature_flag_overrides(user_id, key, enabled, note) values ('${riderD}', 'plans', true, 'Trying Free');`);
await asRider(riderD);
const onFree = await myPlan();
assert.deepEqual(
  { enforced: onFree.enforced, tier: onFree.tier, clubAccess: onFree.clubAccess, academy: onFree.academy },
  { enforced: true, tier: "free", clubAccess: "none", academy: { picksLimit: 2, picksUsed: 0, openPicks: [] } }
);
await assert.rejects(watchLesson(seatLesson), paywall(/not part of your plan/), "On Free a paid lesson waits for a pick.");
assert.deepEqual((await watchLesson(groomingLesson)).rows, [{ status: "ready" }], "Free lessons are open on every plan.");

const afterPick = (await pickLesson(seatLesson)).rows[0]?.plan as PlanState;
assert.deepEqual(afterPick.academy, { picksLimit: 2, picksUsed: 1, openPicks: [seatLesson] }, "A pick answers with the plan as it now stands.");
assert.deepEqual((await watchLesson(seatLesson)).rows, [{ status: "ready" }], "A picked lesson opens at once.");
await pickLesson(canterLesson);
await assert.rejects(pickLesson(gridLesson), paywall(/No lesson picks left/), "Free picks two paid lessons, not three.");
await pickLesson(seatLesson);
assert.equal((await myPlan()).academy.picksUsed, 2, "Opening a lesson already picked spends nothing.");
await pickLesson(groomingLesson);
assert.equal((await myPlan()).academy.picksUsed, 2, "A free lesson is never a pick.");
await assert.rejects(
  db.query("insert into public.academy_lesson_picks(user_id, lesson_id) values ($1, $2)", [riderD, gridLesson]),
  /permission denied/,
  "Picks go through pick_academy_lesson, which counts them."
);

// Free has no Club: no feed, no thread, no writing.
assert.equal(await readsPost(plansPost), false, "Free does not read the Club.");
assert.equal(
  (await db.query("select id from public.club_comments where post_id = $1", [plansPost])).rows.length, 0,
  "A thread follows its post."
);
await assert.rejects(
  db.query("insert into public.club_posts(author_id, space_id, post_type, body) values ($1, $2, 'ride', 'Hello, Club')", [riderD, spaceId]),
  /row-level security/,
  "Free does not post in the Club."
);
await assert.rejects(
  db.query("insert into public.club_memberships(space_id, user_id, role) values ($1, $2, 'member')", [spaceId, riderD]),
  /row-level security/,
  "Free does not join Club spaces."
);

// An admin gives a plan by email -- with the second factor, like flags.
await assert.rejects(db.query("select public.staff_set_plan('rider-d@equina.test', 'mid')"), /Only an admin/,
  "A rider cannot give themselves a plan.");
await asStaff("aal1");
await assert.rejects(db.query("select public.staff_set_plan('rider-d@equina.test', 'mid')"), /Only an admin/,
  "An admin password alone must not give plans.");
await asStaff("aal2");
await assert.rejects(db.query("select public.staff_set_plan('nobody@equina.test', 'mid')"), /No Equina account/);
await assert.rejects(db.query("select public.staff_set_plan('rider-d@equina.test', 'gold')"), /Choose Free, Plus or Premium/);
await assert.rejects(
  db.query("select public.staff_set_plan('rider-d@equina.test', 'mid', now() - interval '1 day')"),
  /end date in the future/
);
assert.equal(
  (await db.query<{ tier: string }>("select public.staff_set_plan(' Rider-D@equina.test ', 'mid', null, 'Beta tester') as tier")).rows[0]?.tier,
  "mid",
  "An email finds its account whatever its case or spacing."
);

await asRider(riderD);
const onPlus = await myPlan();
assert.deepEqual(
  { tier: onPlus.tier, status: onPlus.status, source: onPlus.source, clubAccess: onPlus.clubAccess, picksLimit: onPlus.academy.picksLimit },
  { tier: "mid", status: "active", source: "staff", clubAccess: "post", picksLimit: 30 }
);
assert.ok(await readsPost(plansPost), "Plus reads the Club.");
await db.query("insert into public.club_comments(post_id, author_id, body) values ($1, $2, 'Lovely way to end the week.')", [plansPost, riderD]);
await pickLesson(gridLesson);
assert.deepEqual((await watchLesson(gridLesson)).rows, [{ status: "ready" }], "Plus picks up to thirty.");

// Ralf's allowance follows the plan, from the day the plan started.
await db.exec("reset role;");
const plusSpend = await spend(riderD, "20000000-0000-4000-8000-0000000000d1");
assert.equal(plusSpend.rows[0]?.spend_coach_credits.balance, 99, "Plus grants its 100 credits on first use.");
const plusLots = await db.query<{ source: string; source_ref: string; granted: number }>(
  "select source, source_ref, granted from public.coach_credit_lots where user_id = $1", [riderD]
);
assert.equal(plusLots.rows.length, 1, "A rider on Plus is granted Plus's allowance, not Free's as well.");
assert.equal(plusLots.rows[0]?.source, "staff");
assert.match(plusLots.rows[0]?.source_ref ?? "", /^plan:mid:\d+:0$/);

await asStaff("aal2");
await db.query("select public.staff_set_plan('rider-d@equina.test', 'premium')");
await db.exec("reset role;");
await spend(riderD, "20000000-0000-4000-8000-0000000000d2");
assert.equal(await balanceOf(riderD), 398, "Moving up to Premium grants its 300 at once, on top of what is left.");
await asRider(riderD);
assert.deepEqual((await watchLesson(reinBackLesson)).rows, [{ status: "ready" }], "Premium opens every lesson, picked or not.");
assert.equal((await myPlan()).academy.picksLimit, null);

// Taking the plan back: the earliest picks stay open, as many as Free allows.
await asStaff("aal2");
await db.query("select public.staff_set_plan('rider-d@equina.test', 'free', null, 'Beta over')");
await asRider(riderD);
const downgraded = await myPlan();
assert.deepEqual(
  { tier: downgraded.tier, academy: downgraded.academy },
  { tier: "free", academy: { picksLimit: 2, picksUsed: 3, openPicks: [seatLesson, canterLesson] } },
  "After a downgrade the earliest picks stay open."
);
await assert.rejects(watchLesson(gridLesson), paywall(/not part of your plan/), "A pick beyond the allowance closes again.");
await assert.rejects(pickLesson(gridLesson), paywall(/No lesson picks left/), "Picking it again does not reopen it.");
assert.equal(await readsPost(plansPost), false, "Back on Free, the Club closes.");

// A plan bought in the store and one staff gave never overwrite each other:
// the higher applies, and each lapses on its own.
await db.exec(`
  reset role;
  insert into public.feature_flag_overrides(user_id, key, enabled) values ('${riderE}', 'plans', true);
  insert into public.plan_subscriptions(user_id, source, tier, status, product_id, original_transaction_id, trial_ends_at, ends_at)
  values ('${riderE}', 'app_store', 'mid', 'trialing', 'equina.plus.monthly', 'txn-plus-1', now() + interval '7 days', now() + interval '7 days');
`);
await asRider(riderE);
const onTrial = await myPlan();
assert.deepEqual({ tier: onTrial.tier, status: onTrial.status, source: onTrial.source }, { tier: "mid", status: "trialing", source: "app_store" });
await asStaff("aal2");
await db.query("select public.staff_set_plan('rider-e@equina.test', 'premium')");
await asRider(riderE);
assert.equal((await myPlan()).tier, "premium", "Of two plans, the higher applies.");
await asStaff("aal2");
await db.query("select public.staff_set_plan('rider-e@equina.test', 'free')");
await asRider(riderE);
assert.equal((await myPlan()).tier, "mid", "Taking back a staff plan leaves the one bought in the store.");
await db.exec(`reset role; update public.plan_subscriptions set ends_at = now() - interval '1 minute' where user_id = '${riderE}' and source = 'app_store';`);
await asRider(riderE);
assert.equal((await myPlan()).tier, "free", "A plan lapses at its end date, with nothing running at that moment.");
assert.ok(
  (await db.query<{ user_id: string }>("select user_id from public.plan_subscriptions")).rows.every((row) => row.user_id === riderE),
  "A rider reads only their own plans."
);
await assert.rejects(
  db.query("insert into public.plan_subscriptions(user_id, source, tier, status) values ($1, 'stripe', 'premium', 'active')", [riderE]),
  /permission denied/,
  "A rider can never write a plan."
);
await assert.rejects(db.query("select * from public.staff_list_plans()"), /Only an admin/, "Who holds a plan is for admins.");

// The admin's view, and what a plan holds changed as data.
await asStaff("aal2");
const listed = await db.query<{ email: string; tier_name: string; status: string; live: boolean; granted_by_email: string | null }>(
  "select email, tier_name, status, live, granted_by_email from public.staff_list_plans() where email = 'rider-d@equina.test'"
);
assert.deepEqual(listed.rows, [
  { email: "rider-d@equina.test", tier_name: "Premium", status: "revoked", live: false, granted_by_email: "staff@equina.test" }
]);
await assert.rejects(db.query("select public.staff_update_plan_tier('mid', 'Plus', 5000, 'post', 100, 1, 0, 7)"), /from 0 to 1000/);
await assert.rejects(db.query("select public.staff_update_plan_tier('free', 'Free', 2, 'none', 15, 0, 0, 7)"), /Free has no trial/);
await db.query("select public.staff_update_plan_tier('free', 'Free', 3, 'read', 20, 0, 0, 0)");
await asRider(riderD);
const widened = await myPlan();
assert.deepEqual(
  { clubAccess: widened.clubAccess, openPicks: widened.academy.openPicks },
  { clubAccess: "read", openPicks: [seatLesson, canterLesson, gridLesson] },
  "Free reading the Club and picking three is a row, not a migration."
);
assert.ok(await readsPost(plansPost), "'read' opens the feed.");
await assert.rejects(
  db.query("insert into public.club_comments(post_id, author_id, body) values ($1, $2, 'Me too!')", [plansPost, riderD]),
  /row-level security/,
  "'read' does not open writing."
);
await assert.rejects(
  db.query("select public.staff_update_plan_tier('free', 'Free', 30, 'post', 15, 0, 0, 0)"),
  /Only an admin/,
  "Riders do not change plans."
);
await asStaff("aal2");
await db.query("select public.staff_update_plan_tier('free', 'Free', 2, 'none', 15, 0, 0, 0)");
await secondFactor("");

// A store plan's month of Ralf credits lasts the month, not just the period
// the store billed: during a 7-day trial ends_at is day 7, and capping the
// credits there left new subscribers with none after the trial (202610060002).
await db.exec(`
  reset role;
  insert into public.plan_subscriptions(user_id, source, tier, status, started_at, trial_ends_at, ends_at)
  values ('${riderB}', 'app_store', 'mid', 'trialing', now(), now() + interval '7 days', now() + interval '7 days');
`);
await spend(riderB, "20000000-0000-4000-8000-0000000000e1");
const trialLots = await db.query<{ source: string; outlives_trial: boolean; granted: number }>(
  "select source, expires_at > now() + interval '20 days' as outlives_trial, granted from public.coach_credit_lots where user_id = $1",
  [riderB]
);
assert.deepEqual(trialLots.rows, [{ source: "app_store", outlives_trial: true, granted: 100 }],
  "A trial's credits last the allowance month, so they are still there when the trial converts.");

// For the erasure below: rider A's own plan and pick, and a plan rider A gave
// someone else, as if rider A had been staff.
await db.exec(`
  reset role;
  insert into public.plan_subscriptions(user_id, source, tier, status) values ('${riderA}', 'staff', 'mid', 'active');
  insert into public.academy_lesson_picks(user_id, lesson_id) values ('${riderA}', '${seatLesson}');
  insert into public.plan_subscriptions(user_id, source, tier, status, granted_by) values ('${riderC}', 'staff', 'mid', 'active', '${riderA}');
`);

// Account erasure. Production soft-deletes the auth user (orders and other
// legal records still point at it), so nothing cascades from auth.users:
// erase_account_data has to name every table that holds a rider's data.
//
// Records kept on purpose, and why. A new table that references auth.users
// must either be erased or be added here with its reason.
const retainedAfterErasure: Record<string, string> = {
  account_audit_events: "audit trail, including of the deletion itself",
  account_deletion_requests: "the request; completed_at records the erasure",
  app_feature_flags: "staff attribution on a global flag",
  checkout_quotes: "marketplace record, legal retention",
  club_spaces: "space attribution",
  coach_credit_ledger: "billing audit trail, append-only",
  coach_credit_lots: "billing grants the ledger points at",
  coach_credit_policies: "staff attribution on a policy",
  coach_safety_events: "trust and safety record",
  content_reports: "trust and safety record",
  dispute_evidence: "marketplace dispute, legal retention",
  horse_record_files: "files on another owner's horse belong to that horse",
  horse_records: "records on another owner's horse belong to that horse",
  listing_photos: "marketplace record, legal retention",
  listing_risk_signals: "trust and safety record",
  listings: "marketplace record, legal retention",
  marketplace_conversations: "marketplace record; messages are redacted",
  marketplace_reports: "trust and safety record",
  marketplace_reviews: "marketplace record, legal retention",
  moderation_actions: "trust and safety record",
  order_disputes: "marketplace dispute, legal retention",
  order_events: "marketplace order history, legal retention",
  orders: "marketplace order, legal retention",
  seller_accounts: "payments onboarding, legal retention",
  user_sanctions: "trust and safety record"
};
// Kept as rows but stripped of the rider's content.
const redactedAfterErasure = new Set(["club_posts", "club_comments", "marketplace_messages", "profiles"]);

await db.exec("reset role;");
const riderReferences = await db.query<{ table_name: string; column_name: string }>(`
  select c.conrelid::regclass::text as table_name, a.attname as column_name
  from pg_constraint c
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
  where c.contype = 'f'
    and c.confrelid = 'auth.users'::regclass
    and c.connamespace = 'public'::regnamespace
`);
const erasureSource = (await db.query<{ prosrc: string }>(
  "select prosrc from pg_proc where proname = 'erase_account_data'"
)).rows[0]?.prosrc ?? "";
const tableOf = (name: string) => name.replace(/^public\./, "");
for (const { table_name } of riderReferences.rows) {
  const table = tableOf(table_name);
  assert.ok(
    new RegExp(`public\\.${table}\\b`).test(erasureSource) || table in retainedAfterErasure,
    `${table} references auth.users but erase_account_data neither erases it nor is it listed as retained on purpose.`
  );
}

// Rows the newer features create, so the erasure is proven against them.
await db.query(`
  insert into public.ride_entries(
    rider_id, horse_id, discipline, focus, started_at, completed_at,
    elapsed_seconds, completed_phases, total_phases, mood, rider_note
  ) values ($1, $2, 'jumping', 'Rhythm', now() - interval '1 hour', now(), 1800, 2, 3, 'tender', 'Private note')
`, [riderA, horseId]);
await db.query(
  "insert into public.feature_flag_overrides(user_id, key, enabled, expires_at) values ($1, 'ride_logging', true, now() + interval '30 days')",
  [riderA]
);
const beforeErasure = await db.query<{ rides: number; progress: number; horses: number; conversations: number; packs: number; picks: number; plans: number }>(`
  select
    (select count(*)::int from public.ride_entries where rider_id = $1) as rides,
    (select count(*)::int from public.academy_progress where user_id = $1) as progress,
    (select count(*)::int from public.horses where owner_id = $1) as horses,
    (select count(*)::int from public.coach_conversations where user_id = $1) as conversations,
    (select count(*)::int from public.onboarding_starter_packs where user_id = $1) as packs,
    (select count(*)::int from public.academy_lesson_picks where user_id = $1) as picks,
    (select count(*)::int from public.plan_subscriptions where user_id = $1) as plans
`, [riderA]);
for (const [name, count] of Object.entries(beforeErasure.rows[0] ?? {})) {
  assert.ok(count > 0, `The erasure test needs rider A to have ${name} before erasing.`);
}

await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${riderA}', false);`);
await assert.rejects(
  db.query("select public.erase_account_data($1)", [riderA]),
  /permission denied/,
  "Only the deletion worker may erase an account."
);
await db.exec("reset role; set role service_role;");
const savedByOthers = await db.query<{ count: number }>(
  "select count(*)::int as count from public.saved_listings where user_id = $1", [riderC]
);
await db.query("select public.erase_account_data($1)", [riderA]);
await db.exec("reset role;");

for (const { table_name, column_name } of riderReferences.rows) {
  const table = tableOf(table_name);
  if (table in retainedAfterErasure || redactedAfterErasure.has(table)) continue;
  const left = await db.query<{ count: number }>(
    `select count(*)::int as count from public.${table} where ${column_name} = $1`, [riderA]
  );
  assert.equal(left.rows[0]?.count, 0, `${table}.${column_name} still holds rows of an erased account.`);
}
const redacted = await db.query<{ name: string; avatar: string | null; posts: number; comments: number }>(`
  select
    (select display_name from public.profiles where id = $1) as name,
    (select avatar_path from public.profiles where id = $1) as avatar,
    (select count(*)::int from public.club_posts
      where author_id = $1 and (body <> '[Deleted by rider]' or moderation_status <> 'deleted')) as posts,
    (select count(*)::int from public.club_comments
      where author_id = $1 and (body <> '[Deleted by rider]' or moderation_status <> 'deleted')) as comments
`, [riderA]);
assert.deepEqual(redacted.rows[0], { name: "Deleted rider", avatar: null, posts: 0, comments: 0 },
  "An erased rider's profile, posts and comments must keep no content.");
const othersAfter = await db.query<{ count: number }>(
  "select count(*)::int as count from public.saved_listings where user_id = $1", [riderC]
);
assert.equal(othersAfter.rows[0]?.count, savedByOthers.rows[0]?.count, "Erasing one rider must not touch another's data.");
const planGiven = await db.query<{ tier: string; granted_by: string | null }>(
  "select tier, granted_by from public.plan_subscriptions where user_id = $1", [riderC]
);
assert.deepEqual(planGiven.rows, [{ tier: "mid", granted_by: null }],
  "A plan an erased account gave stays with the rider who received it, without the giver's name.");

await db.close();
console.log("Backend migrations executed successfully in isolated Postgres.");