import assert from "node:assert/strict";
import { openBackendDatabase } from "./backend-database";

// Club replies and activity (202610060004): a reply answers a comment on the
// same post, one level deep, and riders are told about comments on their
// posts, replies to their comments and likes -- by the database, so no client
// can skip or fake it.

const db = await openBackendDatabase();

const author = "30000000-0000-4000-8000-000000000001";
const commenter = "30000000-0000-4000-8000-000000000002";
const other = "30000000-0000-4000-8000-000000000003";
// Signed up, never invited: outside the beta door.
const stranger = "30000000-0000-4000-8000-000000000004";

await db.exec(`
  insert into auth.users(id, email, email_confirmed_at, raw_user_meta_data) values
    ('${author}', 'author@example.com', now(), '{"display_name":"Author"}'),
    ('${commenter}', 'commenter@example.com', now(), '{"display_name":"Commenter"}'),
    ('${other}', 'other@example.com', now(), '{"display_name":"Other"}'),
    ('${stranger}', 'stranger@example.com', now(), '{"display_name":"Stranger"}');
  insert into public.beta_invites(email) values
    ('author@example.com'), ('commenter@example.com'), ('other@example.com');
  update public.app_feature_flags set enabled = true, rollout_percent = 100
  where key in ('club_publishing', 'club_interactions');
`);

const asRider = (user: string) =>
  db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);`);
const asOwner = () => db.exec("reset role;");

const jumping = (await db.query<{ id: string }>("select id from public.club_spaces where slug = 'jumping'")).rows[0]!.id;

const createPost = async (rider: string, body: string) => {
  await asRider(rider);
  const row = (await db.query<{ id: string; moderation_status: string }>(
    "insert into public.club_posts(author_id, space_id, post_type, body) values ($1, $2, 'journal', $3) returning id, moderation_status",
    [rider, jumping, body]
  )).rows[0]!;
  assert.equal(row.moderation_status, "visible", "A post the phrase filter lets through is visible at once.");
  return row.id;
};
const comment = async (rider: string, postId: string, body: string, parentId?: string) => {
  await asRider(rider);
  return (await db.query<{ id: string; parent_id: string | null }>(
    "insert into public.club_comments(post_id, author_id, body, parent_id) values ($1, $2, $3, $4) returning id, parent_id",
    [postId, rider, body, parentId ?? null]
  )).rows[0]!;
};
type Activity = { kind: string; actor_id: string; comment_id: string | null; read_at: string | null };
const activityOf = async (rider: string) => {
  await asRider(rider);
  return (await db.query<Activity>(
    "select kind, actor_id, comment_id, read_at from public.club_activity order by created_at, kind"
  )).rows;
};
const summary = (rows: Activity[]) => rows.map((row) => `${row.kind}:${row.actor_id}`);

const post = await createPost(author, "Soft contact today.");

// A comment tells the post's author, and nobody else.
const first = await comment(commenter, post, "Lovely rhythm.");
assert.deepEqual(summary(await activityOf(author)), [`comment:${commenter}`]);
assert.deepEqual(await activityOf(commenter), [], "The commenter is not told about their own comment.");

// The author answering on their own post tells the commenter, not the author.
const answer = await comment(author, post, "Thank you!", first.id);
assert.equal(answer.parent_id, first.id);
assert.deepEqual(summary(await activityOf(commenter)), [`reply:${author}`]);
assert.deepEqual(summary(await activityOf(author)), [`comment:${commenter}`]);

// An answer to a reply joins the thread it is in: one level deep. It tells the
// thread's commenter, and the post's author separately.
const nested = await comment(other, post, "Agreed.", answer.id);
assert.equal(nested.parent_id, first.id, "A reply to a reply is filed under the top comment.");
assert.deepEqual(summary(await activityOf(commenter)), [`reply:${author}`, `reply:${other}`]);
assert.deepEqual(summary(await activityOf(author)), [`comment:${commenter}`, `comment:${other}`]);

// A reply answers a comment on the same post, and one that is still there.
const elsewhere = await createPost(other, "Trail day.");
await asRider(commenter);
await assert.rejects(
  db.query("insert into public.club_comments(post_id, author_id, body, parent_id) values ($1, $2, 'Hi', $3)", [elsewhere, commenter, first.id]),
  /same post/
);

// A like tells the author once; taking it back takes the activity back; liking
// your own post tells nobody.
await asRider(commenter);
await db.query("insert into public.club_reactions(post_id, user_id, reaction) values ($1, $2, 'like')", [post, commenter]);
assert.ok(summary(await activityOf(author)).includes(`like:${commenter}`));
await asRider(commenter);
await db.query("delete from public.club_reactions where post_id = $1 and user_id = $2", [post, commenter]);
assert.ok(!summary(await activityOf(author)).includes(`like:${commenter}`), "An unlike takes the activity back.");
await asRider(commenter);
await db.query("insert into public.club_reactions(post_id, user_id, reaction) values ($1, $2, 'like')", [post, commenter]);
await asRider(author);
await db.query("insert into public.club_reactions(post_id, user_id, reaction) values ($1, $2, 'like')", [post, author]);
assert.deepEqual(
  summary(await activityOf(author)).filter((entry) => entry.startsWith("like:")),
  [`like:${commenter}`],
  "One like each, and none for the author's own."
);

// Nobody reads another rider's activity, and nothing reaches outside the beta.
assert.equal((await activityOf(other)).length, 0, "Other only wrote; nothing was answered to them.");
assert.equal((await activityOf(stranger)).length, 0);
await db.exec("reset role; set role anon; select set_config('request.jwt.claim.sub', '', false);");
await assert.rejects(db.query("select * from public.club_activity"), /permission denied/);
await asRider(commenter);
await assert.rejects(
  db.query("insert into public.club_activity(recipient_id, actor_id, kind, post_id) values ($1, $2, 'like', $3)", [author, commenter, post]),
  /permission denied/,
  "Only the triggers write activity."
);

// A comment hidden by moderation hides what it caused, and showing it again
// does not tell the author twice.
await asOwner();
await db.query("update public.club_comments set moderation_status = 'hidden' where id = $1", [first.id]);
assert.ok(!summary(await activityOf(author)).includes(`comment:${commenter}`));
await asOwner();
await db.query("update public.club_comments set moderation_status = 'visible' where id = $1", [first.id]);
assert.equal(
  summary(await activityOf(author)).filter((entry) => entry === `comment:${commenter}`).length,
  1
);

// Blocking hides the blocked rider's activity, either way round.
await asRider(author);
await db.query("insert into public.user_blocks(blocker_id, blocked_id) values ($1, $2)", [author, other]);
assert.ok(!summary(await activityOf(author)).some((entry) => entry.endsWith(other)), "Blocked riders' activity is hidden.");
await asRider(author);
await db.query("delete from public.user_blocks where blocker_id = $1 and blocked_id = $2", [author, other]);

// Opening the inbox marks it read.
await asRider(author);
const marked = (await db.query<{ marked: number }>("select public.mark_club_activity_read() as marked")).rows[0]!.marked;
assert.ok(marked >= 3);
assert.ok((await activityOf(author)).every((row) => row.read_at !== null));
assert.ok((await activityOf(commenter)).every((row) => row.read_at === null), "Marking is the reader's own.");

// Erasing an account takes its activity both ways: what it was told, and what
// others were told it did.
await db.exec("reset role; set role service_role;");
await db.query("select public.erase_account_data($1)", [commenter]);
await asOwner();
const left = (await db.query<{ count: number }>(
  "select count(*)::int as count from public.club_activity where recipient_id = $1 or actor_id = $1", [commenter]
)).rows[0]!.count;
assert.equal(left, 0);

await db.close();
console.log("Club replies and activity passed.");
