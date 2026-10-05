import assert from "node:assert/strict";
import { openBackendDatabase } from "./backend-database";
import { betaAccessCopy } from "../src/features/account/beta-access-copy";
import {
  capabilitiesStale,
  capabilityRefreshIntervalMs,
  effectiveCapabilities,
  emptyCapabilities,
  loadsPlan,
  showsBetaDoor
} from "../src/features/account/session-capabilities";
import type { BackendCapabilities } from "../src/backend/contracts";

// The beta door (202610060003): who is in Equina's closed beta, on top of the
// feature flags and under the plans.

// --- The app's side -------------------------------------------------------------------

{
  const server: BackendCapabilities = { ...emptyCapabilities, auth: true, appAccess: true, purchases: true };
  assert.equal(emptyCapabilities.appAccess, true, "Signed out and in the demo, nobody is outside the beta.");
  assert.equal(effectiveCapabilities(server).appAccess, true);
  assert.equal(effectiveCapabilities({ ...server, appAccess: false }).appAccess, false);
  assert.equal(
    effectiveCapabilities({ ...server, appAccess: false }).purchases,
    false,
    "Nothing is sold to an account outside the beta, whatever the server said about purchases."
  );
  // A server from before the door sends no appAccess, and enforces no door.
  const older: Partial<BackendCapabilities> = { ...server };
  delete older.appAccess;
  assert.equal(effectiveCapabilities(older as BackendCapabilities).appAccess, true);

  const outside = { appAccess: false };
  const inside = { appAccess: true };
  assert.equal(showsBetaDoor("authenticated", outside), true);
  assert.equal(showsBetaDoor("onboarding", outside), true, "The door stands in front of onboarding too.");
  assert.equal(showsBetaDoor("authenticated", inside), false);
  assert.equal(showsBetaDoor("onboarding", inside), false);
  assert.equal(showsBetaDoor("signedOut", outside), false, "Signed out, the sign-in screen shows, never the door.");
  assert.equal(showsBetaDoor("restoring", outside), false);
  assert.equal(showsBetaDoor("recoverableError", outside), false);
  assert.equal(showsBetaDoor("demo", outside), false);

  // The plan loads only inside. At the door my_plan() says no access and no
  // Club; loading it there would leave that answer standing after the account
  // is let in. Coming through the door turns loading on, which loads it again.
  assert.equal(loadsPlan("connected", "authenticated", outside), false);
  assert.equal(loadsPlan("connected", "authenticated", inside), true);
  assert.equal(loadsPlan("connected", "onboarding", inside), false);
  assert.equal(loadsPlan("demo", "demo", inside), false, "The demo never asks the server for a plan.");

  // Coming back to the app asks the server again, at most once a minute.
  assert.equal(capabilityRefreshIntervalMs, 60_000);
  assert.equal(capabilitiesStale(0, 1_000), false);
  assert.equal(capabilitiesStale(1_000, 1_000 + 59_999), false);
  assert.equal(capabilitiesStale(1_000, 1_000 + 60_000), true);

  // Equina emails nobody when they are invited; the door must not say it will.
  const words = [
    betaAccessCopy.title,
    betaAccessCopy.body("rider@example.com"),
    betaAccessCopy.body(""),
    betaAccessCopy.stillWaiting
  ].join(" ");
  assert.doesNotMatch(words, /\b(we('ll| will)|email you|notify|let you know)\b/i);
  assert.match(betaAccessCopy.body("rider@example.com"), /rider@example\.com/);
}

// --- The database ---------------------------------------------------------------------

const db = await openBackendDatabase();

const member = "20000000-0000-4000-8000-000000000001";
const outsider = "20000000-0000-4000-8000-000000000002";
const unconfirmed = "20000000-0000-4000-8000-000000000003";
const revoked = "20000000-0000-4000-8000-000000000004";
const shouting = "20000000-0000-4000-8000-000000000005";
const tester = "20000000-0000-4000-8000-000000000006";
const admin = "20000000-0000-4000-8000-000000000007";
const moderator = "20000000-0000-4000-8000-000000000008";

await db.exec(`
  insert into auth.users(id, email, email_confirmed_at, raw_user_meta_data) values
    ('${member}', 'member@example.com', now(), '{"display_name":"Member"}'),
    ('${outsider}', 'outsider@example.com', now(), '{"display_name":"Outsider"}'),
    ('${unconfirmed}', 'unconfirmed@example.com', null, '{"display_name":"Unconfirmed"}'),
    ('${revoked}', 'revoked@example.com', now(), '{"display_name":"Revoked"}'),
    ('${shouting}', 'Shouting.Rider@Example.COM', now(), '{"display_name":"Shouting"}'),
    ('${tester}', 'tester@example.com', now(), '{"display_name":"Tester"}'),
    ('${admin}', 'admin@example.com', now(), '{"display_name":"Admin"}'),
    ('${moderator}', 'moderator@example.com', now(), '{"display_name":"Moderator"}');
  insert into public.user_roles(user_id, role) values ('${admin}', 'admin'), ('${moderator}', 'moderator');
  insert into public.beta_invites(email, invited_by) values
    ('member@example.com', '${admin}'),
    ('unconfirmed@example.com', '${admin}'),
    ('revoked@example.com', '${admin}'),
    ('shouting.rider@example.com', '${admin}');
  update public.beta_invites set revoked_at = now() where email = 'revoked@example.com';
  -- What the owner turns on for the beta once this ships. public_access stays off.
  update public.app_feature_flags set enabled = true, rollout_percent = 100
  where key in ('horse_management', 'record_mutations', 'ride_logging', 'coach_chat', 'coach_credits',
                'academy_progress', 'account_settings', 'club_publishing', 'club_interactions', 'plans');
`);

const enabled = async (key: string, user: string): Promise<boolean | undefined> =>
  (await db.query<{ on: boolean }>("select private.feature_enabled($1, $2) as on", [key, user])).rows[0]?.on;
const access = async (user: string): Promise<boolean | undefined> =>
  (await db.query<{ on: boolean }>("select private.has_app_access($1) as on", [user])).rows[0]?.on;
const asRider = (user: string) =>
  db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);`);
const secondFactor = (aal: "aal1" | "aal2" | "") =>
  db.exec(`select set_config('request.jwt.claims', '${aal ? JSON.stringify({ aal }) : ""}', false);`);
const asAdmin = async (aal: "aal1" | "aal2") => {
  await asRider(admin);
  await secondFactor(aal);
};
const refusedWith = (code: string, pattern?: RegExp) => (error: unknown) =>
  error instanceof Error && (error as { code?: string }).code === code && (!pattern || pattern.test(error.message));

// The gate. A global flag at 100% is not enough: the account has to be inside.
assert.equal(await enabled("horse_management", outsider), false, "A flag on for everyone stays off outside the beta.");
assert.equal(await enabled("horse_management", member), true, "An invited account with a confirmed email is inside.");
assert.equal(await enabled("horse_management", unconfirmed), false, "An unconfirmed email could be someone else's address.");
assert.equal(await enabled("horse_management", revoked), false, "A revoked invite lets nobody in.");
assert.equal(await enabled("horse_management", shouting), true, "The account's email matches its invite whatever its case.");
assert.equal(await access(member), true);
assert.equal(await access(outsider), false);
assert.equal(await access("20000000-0000-4000-8000-0000000000ff"), false, "No such account, no access.");

// account_settings stays with every account holder, so anyone waiting outside
// can still export and delete their own data.
assert.equal(await enabled("account_settings", outsider), true);
assert.equal(await enabled("account_settings", unconfirmed), true);

// A per-person override still wins, in both directions.
await db.exec(`
  insert into public.feature_flag_overrides(user_id, key, enabled, note) values
    ('${tester}', 'horse_management', true, 'Tester from before the beta door'),
    ('${member}', 'ride_logging', false, 'Ride journal held back for this rider');
`);
assert.equal(await enabled("horse_management", tester), true, "Testers let in by overrides keep what they have.");
assert.equal(await enabled("ride_logging", tester), false, "An override opens its own feature, not the door.");
assert.equal(await enabled("ride_logging", member), false, "An override turns a feature off for a member too.");
assert.equal(await enabled("record_mutations", member), true);

// public_access: one account in without an invite...
await db.exec(`insert into public.feature_flag_overrides(user_id, key, enabled, note) values ('${outsider}', 'public_access', true, 'Let in by hand');`);
assert.equal(await access(outsider), true);
assert.equal(await enabled("horse_management", outsider), true);
await db.exec(`delete from public.feature_flag_overrides where user_id = '${outsider}' and key = 'public_access';`);
assert.equal(await access(outsider), false);

// ...or one account kept out when the door is open to everyone.
await db.exec(`update public.app_feature_flags set enabled = true, rollout_percent = 100 where key = 'public_access';`);
assert.equal(await access(outsider), true, "Open to everyone, every account is inside.");
assert.equal(await access(unconfirmed), true, "Open to everyone, an invite and its confirmation no longer matter.");
await db.exec(`insert into public.feature_flag_overrides(user_id, key, enabled) values ('${outsider}', 'public_access', false);`);
assert.equal(await access(outsider), false);
assert.equal(await access(member), true, "An invite still lets a member in.");
await db.exec(`delete from public.feature_flag_overrides where user_id = '${outsider}' and key = 'public_access';`);

// The door opens gradually by the same stable bucket every flag uses.
const bucket = (await db.query<{ bucket: number }>(
  "select private.rollout_bucket($1, 'public_access')::int as bucket", [outsider]
)).rows[0]?.bucket ?? 0;
await db.query("update public.app_feature_flags set rollout_percent = $1 where key = 'public_access'", [bucket]);
assert.equal(await access(outsider), false, "An account whose bucket is above the rollout waits outside.");
await db.query("update public.app_feature_flags set rollout_percent = $1 where key = 'public_access'", [bucket + 1]);
assert.equal(await access(outsider), true, "Raising the rollout past its bucket lets it in.");
await db.exec(`update public.app_feature_flags set enabled = false, rollout_percent = 0 where key = 'public_access';`);
assert.equal(await access(outsider), false);

// What the app reads, with the rider's own session.
await asRider(outsider);
const outsiderFlags = await db.query<{ key: string; enabled: boolean }>("select key, enabled from public.current_feature_flags()");
assert.deepEqual(
  outsiderFlags.rows.filter((flag) => flag.enabled).map((flag) => flag.key),
  ["account_settings"],
  "Outside the beta only account settings is on."
);
assert.deepEqual(
  (await db.query<{ value: unknown }>("select public.my_access() as value")).rows[0]?.value,
  { access: false, member: false, publicAccess: false }
);
await asRider(member);
assert.deepEqual(
  (await db.query<{ value: unknown }>("select public.my_access() as value")).rows[0]?.value,
  { access: true, member: true, publicAccess: false }
);
await asRider("");
assert.deepEqual(
  (await db.query<{ value: unknown }>("select public.my_access() as value")).rows[0]?.value,
  { access: false, member: false, publicAccess: false },
  "No account, no access."
);
await db.exec("reset role; set role anon; select set_config('request.jwt.claim.sub', '', false);");
await assert.rejects(db.query("select public.my_access()"), /permission denied/, "my_access is for signed-in accounts.");

// --- What is not behind a flag ------------------------------------------------------------

// The Academy. Plans are off for an account outside the beta, which used to
// open every lesson to it.
await db.exec("reset role;");
const lessonIds: string[] = [];
for (const [slug, kind] of [["beta-free", "free"], ["beta-paid", "paid"]] as const) {
  const row = await db.query<{ id: string }>(`
    insert into public.academy_lessons(slug, title, summary, category, access, duration_seconds, published_at)
    values ($1, $1, 'A lesson for the beta tests.', 'Dressage', $2, 600, now()) returning id
  `, [slug, kind]);
  lessonIds.push(row.rows[0]?.id ?? "");
}
const [freeLesson, paidLesson] = lessonIds as [string, string];
await db.query(
  "insert into public.academy_videos(lesson_id, provider, asset_id, status) values ($1, 'bunny', 'beta-free', 'ready'), ($2, 'bunny', 'beta-paid', 'ready')",
  [freeLesson, paidLesson]
);
// Plans are on for the beta, so the member's pick has something to spend.

await asRider(outsider);
await assert.rejects(
  db.query("select * from public.academy_playback_source($1)", [freeLesson]),
  refusedWith("PT403", /invite-only/),
  "Outside the beta not even a free lesson plays."
);
await assert.rejects(db.query("select * from public.academy_playback_source($1)", [paidLesson]), refusedWith("PT403"));
await assert.rejects(db.query("select public.pick_academy_lesson($1)", [paidLesson]), refusedWith("PT403"));
const outsiderPlan = (await db.query<{ plan: { access: boolean } }>("select public.my_plan() as plan")).rows[0]?.plan;
assert.equal(outsiderPlan?.access, false, "my_plan tells the app not to offer plans or picks.");
await db.exec("reset role;");
assert.equal(
  (await db.query<{ count: number }>("select count(*)::int as count from public.academy_lesson_picks where user_id = $1", [outsider])).rows[0]?.count,
  0
);

await asRider(member);
const memberWatch = await db.query<{ status: string }>("select status from public.academy_playback_source($1)", [freeLesson]);
assert.deepEqual(memberWatch.rows, [{ status: "ready" }]);
const memberPick = await db.query<{ plan: { access: boolean; academy: { picksUsed: number } } }>(
  "select public.pick_academy_lesson($1) as plan", [paidLesson]
);
assert.equal(memberPick.rows[0]?.plan.access, true);
assert.equal(memberPick.rows[0]?.plan.academy.picksUsed, 1, "A member inside the beta picks as before.");
const memberPlan = (await db.query<{ plan: { access: boolean } }>("select public.my_plan() as plan")).rows[0]?.plan;
assert.equal(memberPlan?.access, true);

// The Club. Reads follow club_access, which was 'post' for everyone while
// plans were off. With plans on for the beta, the member holds Plus.
await db.exec(`reset role; insert into public.plan_subscriptions(user_id, source, tier, status) values ('${member}', 'staff', 'mid', 'active');`);
const space = (await db.query<{ id: string }>("select id from public.club_spaces where slug = 'jumping'")).rows[0]?.id;
assert.ok(space);
const postOf = async (author: string, body: string) => (await db.query<{ id: string }>(`
  insert into public.club_posts(author_id, space_id, post_type, body, moderation_status)
  values ($1, $2, 'question', $3, 'visible') returning id
`, [author, space, body])).rows[0]?.id ?? "";
const memberPost = await postOf(member, "Inside the beta");
const outsiderPost = await postOf(outsider, "Posted before the door closed");
await db.query("insert into public.club_comments(post_id, author_id, body, moderation_status) values ($1, $2, 'A reply', 'visible')", [memberPost, member]);
await db.query("insert into public.club_reactions(post_id, user_id, reaction) values ($1, $2, 'like')", [memberPost, member]);
// Written here without a rider's session, so the phrase filter holds them for
// review; staff restoring them is what makes them part of the feed.
await db.exec("update public.club_posts set moderation_status = 'visible'; update public.club_comments set moderation_status = 'visible';");
await db.query("insert into public.club_memberships(space_id, user_id) values ($1, $2), ($1, $3) on conflict do nothing", [space, member, outsider]);
await db.query(
  "insert into storage.objects(bucket_id, name, owner_id) values ('avatars', $1, $2), ('avatars', $3, $4)",
  [`${member}/avatar.jpg`, member, `${outsider}/avatar.jpg`, outsider]
);

const visibleIds = async (sql: string): Promise<string[]> =>
  (await db.query<{ id: string }>(sql)).rows.map((row) => row.id);
const rowCount = async (sql: string): Promise<number> =>
  (await db.query<{ count: number }>(sql)).rows[0]?.count ?? 0;

await asRider(outsider);
assert.deepEqual(await visibleIds("select id from public.club_posts"), [outsiderPost],
  "Outside the beta a rider sees only their own posts, so they can still take one down.");
assert.equal(await rowCount("select count(*)::int as count from public.club_comments"), 0);
assert.equal(await rowCount("select count(*)::int as count from public.club_reactions"), 0);
assert.equal(await rowCount("select count(*)::int as count from public.club_spaces"), 0);
assert.deepEqual(
  (await db.query<{ user_id: string }>("select user_id from public.club_memberships")).rows.map((row) => row.user_id),
  [outsider],
  "Outside the beta a rider sees their own memberships and nobody else's."
);
assert.deepEqual(await visibleIds("select id from public.profiles order by id"), [outsider],
  "Signing up does not list who is inside.");
assert.deepEqual(
  (await db.query<{ name: string }>("select name from storage.objects where bucket_id = 'avatars'")).rows.map((row) => row.name),
  [`${outsider}/avatar.jpg`],
  "Nor does it show their pictures: outside the beta an account reads only its own avatar."
);

await asRider(member);
assert.equal((await visibleIds("select id from public.club_posts")).length, 2);
assert.equal(await rowCount("select count(*)::int as count from public.club_comments"), 1);
assert.equal(await rowCount("select count(*)::int as count from public.club_reactions"), 1);
assert.ok(await rowCount("select count(*)::int as count from public.club_spaces") >= 5);
assert.equal(await rowCount("select count(*)::int as count from public.club_memberships"), 2);
assert.equal(await rowCount("select count(*)::int as count from public.profiles"), 8);
assert.equal(await rowCount("select count(*)::int as count from storage.objects where bucket_id = 'avatars'"), 2);

// --- The invite list is staff's alone ------------------------------------------------------

await asRider(member);
await assert.rejects(db.query("select * from public.beta_invites"), /permission denied/);
await assert.rejects(db.query("insert into public.beta_invites(email) values ('sneaky@example.com')"), /permission denied/);
await assert.rejects(db.query("update public.beta_invites set revoked_at = null"), /permission denied/);
await assert.rejects(db.query("delete from public.beta_invites"), /permission denied/);
await db.exec("reset role; set role anon; select set_config('request.jwt.claim.sub', '', false);");
await assert.rejects(db.query("select * from public.beta_invites"), /permission denied/);
await assert.rejects(db.query("insert into public.beta_invites(email) values ('sneaky@example.com')"), /permission denied/);
await db.exec("reset role;");
await assert.rejects(
  db.query("insert into public.beta_invites(email) values ('Mixed@Example.com')"),
  /check constraint/,
  "The table only holds lower-cased, trimmed addresses."
);
await assert.rejects(db.query("insert into public.beta_invites(email) values ('not-an-email')"), /check constraint/);

// The admin's functions need the admin role and the second factor.
await asRider(outsider);
await assert.rejects(db.query("select public.staff_invite_beta('friend@example.com', null)"), refusedWith("42501"));
await assert.rejects(db.query("select * from public.staff_list_beta_invites()"), refusedWith("42501"));
await assert.rejects(db.query("select public.staff_revoke_beta('member@example.com')"), refusedWith("42501"));
await assert.rejects(db.query("select public.staff_set_public_access(true)"), refusedWith("42501"));
await asAdmin("aal1");
await assert.rejects(db.query("select public.staff_invite_beta('friend@example.com', null)"), refusedWith("42501"),
  "An admin password without the second factor invites nobody.");
await assert.rejects(db.query("select * from public.staff_list_beta_invites()"), refusedWith("42501"));
await assert.rejects(db.query("select public.staff_set_public_access(true)"), refusedWith("42501"));

await asAdmin("aal2");
const invited = await db.query<{ email: string }>(
  "select public.staff_invite_beta('  Outsider@Example.COM ', '  Coach from the yard  ') as email"
);
assert.equal(invited.rows[0]?.email, "outsider@example.com", "The email is stored the way it will be matched.");
await assert.rejects(db.query("select public.staff_invite_beta('no-at-sign', null)"), refusedWith("22023"));
await assert.rejects(db.query("select public.staff_invite_beta('   ', null)"), refusedWith("22023"));
await assert.rejects(db.query("select public.staff_invite_beta('long@example.com', $1)", ["x".repeat(201)]), refusedWith("22023"));
await assert.rejects(db.query("select public.staff_revoke_beta('nobody@example.com')"), refusedWith("P0002"));

type InviteRow = {
  email: string;
  note: string | null;
  invited_at: string;
  invited_by_email: string | null;
  revoked_at: string | null;
  has_account: boolean;
  signed_up_at: string | null;
};
const inviteOf = async (email: string): Promise<InviteRow | undefined> =>
  (await db.query<InviteRow>("select * from public.staff_list_beta_invites() where email = $1", [email])).rows[0];

const outsiderInvite = await inviteOf("outsider@example.com");
assert.equal(outsiderInvite?.note, "Coach from the yard");
assert.equal(outsiderInvite?.invited_by_email, "admin@example.com");
assert.equal(outsiderInvite?.has_account, true);
assert.ok(outsiderInvite?.signed_up_at, "The list says when the invited rider signed up.");
assert.equal((await inviteOf("unconfirmed@example.com"))?.has_account, false, "An unconfirmed account has not signed up yet.");
assert.ok((await inviteOf("revoked@example.com"))?.revoked_at);
await secondFactor("");
await db.exec("reset role;");
assert.equal(await access(outsider), true, "Invited from the admin, the rider is inside at once.");

// Revoke, then invite again.
await asAdmin("aal2");
await db.query("select public.staff_revoke_beta('OUTSIDER@example.com')");
const afterRevoke = await inviteOf("outsider@example.com");
assert.ok(afterRevoke?.revoked_at);
await db.exec("reset role;");
assert.equal(await access(outsider), false, "A revoked rider waits outside again; the account stays.");
await db.exec("update public.beta_invites set invited_at = now() - interval '1 day' where email = 'outsider@example.com';");
await asAdmin("aal2");
await db.query("select public.staff_invite_beta('outsider@example.com', null)");
const afterReinvite = await inviteOf("outsider@example.com");
assert.equal(afterReinvite?.revoked_at, null, "Inviting again clears the revoke.");
assert.equal(afterReinvite?.note, "Coach from the yard", "Inviting again without a note keeps the old one.");
assert.ok(
  new Date(afterReinvite?.invited_at ?? 0).getTime() > Date.now() - 60_000,
  "Inviting again after a revoke is a new invite, from today."
);
await db.exec("reset role;");
assert.equal(await access(outsider), true);

// The launch switch.
await asAdmin("aal2");
await db.query("select public.staff_set_public_access(true)");
await assert.rejects(db.query("select public.staff_set_public_access(null)"), refusedWith("22023"));
await db.exec("reset role;");
const opened = await db.query<{ enabled: boolean; rollout_percent: number; updated_by: string }>(
  "select enabled, rollout_percent, updated_by from public.app_feature_flags where key = 'public_access'"
);
assert.deepEqual(opened.rows[0], { enabled: true, rollout_percent: 100, updated_by: admin });
assert.equal(await access(tester), true, "Open to everyone, an uninvited account is inside.");
await asAdmin("aal2");
await db.query("select public.staff_set_public_access(false)");
await secondFactor("");
await db.exec("reset role;");
const closed = await db.query<{ enabled: boolean; rollout_percent: number }>(
  "select enabled, rollout_percent from public.app_feature_flags where key = 'public_access'"
);
assert.deepEqual(closed.rows[0], { enabled: false, rollout_percent: 0 });
assert.equal(await access(tester), false);

// A per-person override wins over the door, so giving or clearing one is an
// admin power too. A moderator, second factor and all, lets nobody in.
await asRider(moderator);
await secondFactor("aal2");
await assert.rejects(
  db.query("select public.set_feature_flag_override($1, 'public_access', true)", [tester]),
  refusedWith("42501"),
  "A moderator cannot let an account through the door."
);
await assert.rejects(
  db.query("select public.set_feature_flag_override($1, 'coach_chat', true)", [tester]),
  refusedWith("42501"),
  "Nor open one feature to an account outside the beta."
);
await assert.rejects(db.query("select public.clear_feature_flag_override($1, 'horse_management')", [tester]), refusedWith("42501"));
await asAdmin("aal1");
await assert.rejects(db.query("select public.set_feature_flag_override($1, 'public_access', true)", [tester]), refusedWith("42501"));
await asAdmin("aal2");
await db.query("select public.set_feature_flag_override($1, 'public_access', true, null, 'Let in by an admin')", [tester]);
await secondFactor("");
await db.exec("reset role;");
assert.equal(await access(tester), true, "An admin can let one account in with an override.");
assert.equal(await enabled("horse_management", tester), true, "The tester keeps the override from before the door.");
await asAdmin("aal2");
await db.query("select public.clear_feature_flag_override($1, 'public_access')", [tester]);
await secondFactor("");
await db.exec("reset role;");
assert.equal(await access(tester), false);

// --- Erasure ------------------------------------------------------------------------------

await db.exec("reset role; set role service_role;");
await db.query("select public.erase_account_data($1)", [shouting]);
await db.exec("reset role;");
assert.equal(
  await rowCount("select count(*)::int as count from public.beta_invites where email = 'shouting.rider@example.com'"),
  0,
  "An erased account's invite goes with it: it is that person's email."
);
assert.equal(await rowCount("select count(*)::int as count from public.beta_invites"), 4, "Other invites stay.");

await db.exec("reset role; set role service_role;");
await db.query("select public.erase_account_data($1)", [admin]);
await db.exec("reset role;");
assert.equal(
  await rowCount(`select count(*)::int as count from public.beta_invites where invited_by = '${admin}'`),
  0,
  "Invites an erased admin gave keep their rows, without the name of who gave them."
);
assert.equal(await rowCount("select count(*)::int as count from public.beta_invites"), 4);

await db.close();

console.log("Beta door passed.");
