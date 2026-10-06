import assert from "node:assert/strict";
import type { ClubFeedItem, ClubSpace } from "../src/backend/contracts";
import { backendError } from "../src/backend/errors";
import {
  clubErrorMessage,
  clubReportReasons,
  isDuplicateReport,
  relativeTime,
  rideShareLine,
  spaceSlugForDiscipline
} from "../src/features/club/club-format";
import {
  allScope,
  clubFilterChips,
  clubPhotoProblem,
  clubSpaceImageKey,
  composerPrompt,
  orderClubSpaces,
  feedCursor,
  feedEmptyState,
  feedQueryForScope,
  latestActivityLabel,
  mergeFeedPages,
  mineScope,
  sameScope
} from "../src/features/club/club-groups";

const now = Date.parse("2026-10-02T12:00:00Z");

// Relative time.
{
  assert.equal(relativeTime("2026-10-02T11:59:40Z", now), "Just now");
  assert.equal(relativeTime("2026-10-02T11:55:00Z", now), "5m");
  assert.equal(relativeTime("2026-10-02T09:00:00Z", now), "3h");
  assert.equal(relativeTime("2026-09-30T12:00:00Z", now), "2d");
  assert.equal(relativeTime("2026-09-01T12:00:00Z", now), "Sep 1");
  assert.equal(relativeTime("2026-10-02T12:05:00Z", now), "Just now", "A clock ahead of the server must not show negative time.");
  assert.equal(relativeTime("not a date", now), "");
}

// A shared ride carries its own summary: other riders cannot open the journal.
{
  assert.equal(
    rideShareLine({ horseName: "Ralfy", elapsedSeconds: 1920, focus: "Rhythm", mood: "focused" }),
    "Ralfy · 32 min · Rhythm · felt focused"
  );
  assert.equal(rideShareLine({ elapsedSeconds: 20, focus: "Walk" }), "1 min · Walk", "A short ride still reads as a ride.");
  assert.equal(rideShareLine({ horseName: " ", elapsedSeconds: 600, focus: "" }), "10 min");
}

// Default space per discipline.
{
  assert.equal(spaceSlugForDiscipline("Jumping"), "jumping");
  assert.equal(spaceSlugForDiscipline("Trail"), "trail");
  assert.equal(spaceSlugForDiscipline("Western"), "coach-qa", "An unknown discipline falls back to the shared space.");
}

// Report reasons match public.report_reason exactly.
{
  assert.deepEqual(
    clubReportReasons.map((reason) => reason.value).sort(),
    ["animal_welfare", "harassment", "nudity", "other", "scam", "spam", "unsafe_advice"]
  );
}

// Errors the rider can act on, never the database's own words.
{
  const fromDatabase = (message: string, code?: string) =>
    backendError(Object.assign(new Error(message), { code, status: 400 }), "fallback");
  assert.equal(isDuplicateReport(fromDatabase("duplicate key value violates unique constraint", "23505")), true);
  assert.equal(isDuplicateReport(fromDatabase("anything", "42501")), false);
  assert.match(clubErrorMessage(fromDatabase("Post rate limit exceeded", "P0001"), "x"), /posting quickly/);
  assert.match(clubErrorMessage(fromDatabase("This account is temporarily restricted", "P0001"), "x"), /temporarily restricted/);
  assert.match(
    clubErrorMessage(fromDatabase('new row violates row-level security policy for table "club_posts"', "42501"), "x"),
    /not open for this account/
  );
  const offline = backendError(
    Object.assign(new Error("Network request failed"), { status: 0, name: "AuthRetryableFetchError" }),
    "fallback"
  );
  assert.match(clubErrorMessage(offline, "x"), /offline/);
  assert.equal(clubErrorMessage(fromDatabase("relation does not exist", "42P01"), "The feed could not be loaded."), "The feed could not be loaded.");
}

// Groups: a photo per space, with the stable for the ones without one.
{
  assert.equal(clubSpaceImageKey("dressage"), "dressage");
  assert.equal(clubSpaceImageKey("jumping"), "jumping");
  assert.equal(clubSpaceImageKey("eventing"), "eventing");
  assert.equal(clubSpaceImageKey("trail"), "trail");
  assert.equal(clubSpaceImageKey("western"), "stable");
  assert.equal(clubSpaceImageKey("endurance"), "stable");
  assert.equal(clubSpaceImageKey("coach-qa"), "stable");
  assert.equal(clubSpaceImageKey("a-space-added-later"), "stable");
}

const space = (slug: string, name: string): ClubSpace => ({ id: `space-${slug}`, slug, name, isPrivate: false });
const spaces = [space("dressage", "Dressage"), space("jumping", "Jumping"), space("coach-qa", "Coach Q&A")];
const item = (id: string, spaceId: string, createdAt: string): ClubFeedItem => ({
  post: {
    id, authorId: "rider", spaceId, postType: "journal", body: id,
    moderationStatus: "visible", createdAt, updatedAt: createdAt
  },
  author: { id: "rider", displayName: "Rider" },
  media: [],
  reactionCount: 0,
  commentCount: 0
});

// The feed query per scope. "My groups" with nothing joined asks nothing.
{
  assert.deepEqual(feedQueryForScope(allScope, ["space-jumping"]), {});
  assert.deepEqual(feedQueryForScope({ kind: "space", spaceId: "space-dressage" }, []), { spaceId: "space-dressage" });
  assert.deepEqual(feedQueryForScope(mineScope, ["space-jumping", "space-dressage"]), { spaceIds: ["space-jumping", "space-dressage"] });
  assert.equal(feedQueryForScope(mineScope, []), null, "No memberships means an empty feed, not every post.");
  assert.equal(sameScope(allScope, { kind: "all" }), true);
  assert.equal(sameScope(mineScope, allScope), false);
  assert.equal(sameScope({ kind: "space", spaceId: "a" }, { kind: "space", spaceId: "a" }), true);
  assert.equal(sameScope({ kind: "space", spaceId: "a" }, { kind: "space", spaceId: "b" }), false);
}

// The chip row: All, My groups, then only the joined spaces in list order.
{
  assert.deepEqual(clubFilterChips(spaces, []).map((chip) => chip.label), ["All", "My groups"]);
  assert.deepEqual(
    clubFilterChips(spaces, ["space-coach-qa", "space-dressage", "space-never-loaded"]).map((chip) => chip.label),
    ["All", "My groups", "Dressage", "Coach Q&A"],
    "Joined spaces follow the space list; an unknown id adds no chip."
  );
  const chips = clubFilterChips(spaces, ["space-jumping"]);
  assert.deepEqual(chips[2]?.scope, { kind: "space", spaceId: "space-jumping" });
  assert.equal(new Set(chips.map((chip) => chip.key)).size, chips.length, "Keys are unique.");
  // A card tap filters the feed to a group the rider never joined: its chip
  // appears, selected, so the filter is visible and one tap away from All.
  assert.deepEqual(
    clubFilterChips(spaces, ["space-jumping"], { kind: "space", spaceId: "space-coach-qa" }).map((chip) => chip.label),
    ["All", "My groups", "Jumping", "Coach Q&A"]
  );
  assert.deepEqual(
    clubFilterChips(spaces, ["space-jumping"], { kind: "space", spaceId: "space-jumping" }).map((chip) => chip.label),
    ["All", "My groups", "Jumping"],
    "A joined space on screen is listed once."
  );
  assert.deepEqual(clubFilterChips(spaces, [], mineScope).map((chip) => chip.label), ["All", "My groups"]);
}

// Activity per group comes from what is loaded, or says nothing.
{
  const items = [
    item("p1", "space-jumping", "2026-10-02T09:00:00Z"),
    item("p2", "space-jumping", "2026-10-02T11:55:00Z"),
    item("p3", "space-dressage", "2026-09-01T12:00:00Z")
  ];
  assert.equal(latestActivityLabel("space-jumping", items, now), "Last post 5m ago");
  assert.equal(latestActivityLabel("space-dressage", items, now), "Last post Sep 1");
  assert.equal(latestActivityLabel("space-coach-qa", items, now), undefined, "No loaded post, no claim.");
  assert.equal(latestActivityLabel("space-jumping", [item("p4", "space-jumping", "2026-10-02T11:59:50Z")], now), "Last post just now");
  assert.equal(latestActivityLabel("space-jumping", [], now), undefined);
}

// Appending a page never repeats a post, and keeps the order.
{
  const first = [item("a", "s", "2026-10-02T11:00:00Z"), item("b", "s", "2026-10-02T10:00:00Z")];
  const next = [item("b", "s", "2026-10-02T10:00:00Z"), item("c", "s", "2026-10-02T09:00:00Z"), item("c", "s", "2026-10-02T09:00:00Z")];
  assert.deepEqual(mergeFeedPages(first, next).map((entry) => entry.post.id), ["a", "b", "c"]);
  assert.equal(mergeFeedPages(first, [first[1]!]), first, "Nothing new keeps the same array, so nothing re-renders.");
  assert.equal(feedCursor(first), "2026-10-02T10:00:00Z", "The cursor is the oldest item on screen.");
  assert.equal(feedCursor([]), undefined);
}

// What an empty feed says.
{
  const mineEmpty = feedEmptyState({ scope: mineScope, canPost: true, hasMemberships: false });
  assert.equal(mineEmpty.action, "groups", "No memberships points at the Groups tab.");
  assert.match(mineEmpty.body, /Join a group/);
  const mineQuiet = feedEmptyState({ scope: mineScope, canPost: false, hasMemberships: true });
  assert.equal(mineQuiet.action, undefined);
  assert.match(mineQuiet.title, /your groups/);
  assert.equal(feedEmptyState({ scope: { kind: "space", spaceId: "x" }, spaceName: "Trail", canPost: true, hasMemberships: false }).title, "No posts in Trail yet.");
  assert.equal(feedEmptyState({ scope: allScope, canPost: false, hasMemberships: false }).body, "Posts from other riders will appear here.");
  assert.doesNotMatch(composerPrompt(true), /ride go\?/, "The prompt invites any post, not only a ride.");
  assert.match(composerPrompt(true), /photo/);
  assert.doesNotMatch(composerPrompt(false), /photo/, "While photo posts are off, the prompt must not promise one.");
}

// The photo rules match create-upload-ticket's club_post rule.
{
  assert.equal(clubPhotoProblem({ mimeType: "image/jpeg", byteSize: 4 * 1024 * 1024 }), undefined);
  assert.equal(clubPhotoProblem({ mimeType: "image/heic", byteSize: 1 }), undefined);
  assert.match(clubPhotoProblem({ mimeType: "image/gif", byteSize: 1 }) ?? "", /JPEG, PNG or HEIC/);
  assert.match(clubPhotoProblem({ mimeType: "video/mp4", byteSize: 1 }) ?? "", /JPEG, PNG or HEIC/, "Video waits for a later phase.");
  assert.match(clubPhotoProblem({ mimeType: "image/png", byteSize: 50 * 1024 * 1024 + 1 }) ?? "", /50 MB/);
}

// Groups: the rider's discipline first, Coach Q&A last, the rest by name.
{
  const spaces = [
    { slug: "coach-qa", name: "Coach Q&A" },
    { slug: "western", name: "Western" },
    { slug: "dressage", name: "Dressage" },
    { slug: "jumping", name: "Jumping" }
  ];
  assert.deepEqual(orderClubSpaces(spaces, "jumping").map((space) => space.slug), ["jumping", "dressage", "western", "coach-qa"]);
  assert.deepEqual(orderClubSpaces(spaces, "unknown").map((space) => space.slug), ["dressage", "jumping", "western", "coach-qa"]);
  assert.deepEqual(spaces[0]!.slug, "coach-qa", "The input order is left alone.");
}

console.log("Club rules passed.");
