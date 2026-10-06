import type { ClubFeedItem, ClubFeedQuery, ClubSpace } from "../../backend";
import { relativeTime } from "./club-format";

/**
 * The editorial photo a group card shows. Spaces carry no image column, and the
 * app ships only a handful of photos, so the picture follows the slug and
 * everything else gets the stable.
 */
export type ClubSpaceImageKey = "dressage" | "jumping" | "eventing" | "trail" | "stable";

const imageBySlug: Record<string, ClubSpaceImageKey> = {
  dressage: "dressage",
  jumping: "jumping",
  eventing: "eventing",
  trail: "trail"
};

export const clubSpaceImageKey = (slug: string): ClubSpaceImageKey => imageBySlug[slug] ?? "stable";

/** What the feed shows: every readable space, the rider's groups, or one space. */
export type ClubFeedScope = { kind: "all" } | { kind: "mine" } | { kind: "space"; spaceId: string };

export const allScope: ClubFeedScope = { kind: "all" };
export const mineScope: ClubFeedScope = { kind: "mine" };

export const sameScope = (a: ClubFeedScope, b: ClubFeedScope) =>
  a.kind === b.kind && (a.kind !== "space" || b.kind !== "space" || a.spaceId === b.spaceId);

/**
 * null means there is nothing to ask the database: "My groups" with no
 * memberships is an empty feed by definition, not a query for every post.
 */
export const feedQueryForScope = (scope: ClubFeedScope, joinedSpaceIds: string[]): ClubFeedQuery | null => {
  if (scope.kind === "space") return { spaceId: scope.spaceId };
  if (scope.kind === "all") return {};
  return joinedSpaceIds.length ? { spaceIds: [...joinedSpaceIds] } : null;
};

export type ClubFilterChip = { scope: ClubFeedScope; label: string; key: string };

/**
 * "All", "My groups", then one chip per joined space in the order the spaces
 * are listed. Every other space is reached through the Groups tab, so the row
 * stays short however many spaces exist. The space on screen always has a
 * chip, joined or not: a card tap filters the feed to a group the rider never
 * joined, and a filter nobody can see reads as the whole Club.
 */
export const clubFilterChips = (
  spaces: ClubSpace[],
  joinedSpaceIds: string[],
  scope: ClubFeedScope = allScope
): ClubFilterChip[] => {
  const joined = new Set(joinedSpaceIds);
  const shown = (space: ClubSpace) => joined.has(space.id) || (scope.kind === "space" && scope.spaceId === space.id);
  return [
    { scope: allScope, label: "All", key: "all" },
    { scope: mineScope, label: "My groups", key: "mine" },
    ...spaces
      .filter(shown)
      .map((space) => ({ scope: { kind: "space" as const, spaceId: space.id }, label: space.name, key: space.id }))
  ];
};

/**
 * "Last post 2h ago", from the newest loaded item of that space. Nothing when
 * no post of the space is loaded: an absent line is honest, a guess is not.
 */
export const latestActivityLabel = (spaceId: string, items: ClubFeedItem[], now = Date.now()) => {
  let newest: string | undefined;
  for (const item of items) {
    if (item.post.spaceId !== spaceId) continue;
    if (!newest || Date.parse(item.post.createdAt) > Date.parse(newest)) newest = item.post.createdAt;
  }
  if (!newest) return undefined;
  const when = relativeTime(newest, now);
  if (!when) return undefined;
  return when === "Just now" ? "Last post just now" : `Last post ${when}${/^\d/.test(when) ? " ago" : ""}`;
};

/**
 * Older pages appended to the feed. A post can arrive twice when a realtime
 * reload replaced the first page while the next one was in flight, or when a
 * new post pushed the cursor; the first copy wins so React keys stay unique.
 */
export const mergeFeedPages = (current: ClubFeedItem[], next: ClubFeedItem[]): ClubFeedItem[] => {
  const seen = new Set(current.map((item) => item.post.id));
  const appended = next.filter((item) => {
    if (seen.has(item.post.id)) return false;
    seen.add(item.post.id);
    return true;
  });
  return appended.length ? [...current, ...appended] : current;
};

/** Where the next page starts: the created_at of the oldest item on screen. */
export const feedCursor = (items: ClubFeedItem[]) => items.length ? items[items.length - 1]!.post.createdAt : undefined;

export type ClubEmptyState = { title: string; body: string; action?: "groups" };

/** What an empty feed says, and whether it points at the Groups tab. */
export const feedEmptyState = ({
  scope,
  spaceName,
  canPost,
  hasMemberships
}: {
  scope: ClubFeedScope;
  spaceName?: string;
  canPost: boolean;
  hasMemberships: boolean;
}): ClubEmptyState => {
  if (scope.kind === "mine" && !hasMemberships) {
    return { title: "No groups yet.", body: "Join a group to follow it here.", action: "groups" };
  }
  if (scope.kind === "mine") {
    return {
      title: "Nothing in your groups yet.",
      body: canPost ? "Be the first to post in one of your groups." : "Posts from your groups will appear here."
    };
  }
  return {
    title: scope.kind === "space" && spaceName ? `No posts in ${spaceName} yet.` : "No posts yet.",
    body: canPost ? "Share how today's ride went. Riders in your space will see it right away." : "Posts from other riders will appear here."
  };
};

/**
 * The groups list: the rider's own discipline first, the other disciplines by
 * name, and Coach Q&A last, since it is not a discipline. The database orders
 * by name, which would put Coach Q&A first.
 */
export const orderClubSpaces = <T extends { slug: string; name: string }>(spaces: T[], preferredSlug: string): T[] =>
  [...spaces].sort((a, b) => {
    const rank = (space: T) => (space.slug === preferredSlug ? 0 : space.slug === "coach-qa" ? 2 : 1);
    return rank(a) - rank(b) || a.name.localeCompare(b.name);
  });

/**
 * One prompt for the composer row and the sheet, inviting any kind of post.
 * It only promises a photo while photo posts are on (feature-flags.ts).
 */
export const composerPrompt = (withPhoto: boolean) =>
  withPhoto ? "Share a ride, a photo or a question." : "Share a ride or ask a question.";

// create-upload-ticket's club_post rule, checked here so the rider hears it
// before the upload rather than from a failed ticket. Video waits for Phase 2.
export const clubPhotoMaxBytes = 50 * 1024 * 1024;
export const clubPhotoMimeTypes = ["image/jpeg", "image/png", "image/heic", "image/heif"];

/** Why a picked photo cannot go up, or undefined when it can. */
export const clubPhotoProblem = (asset: { mimeType: string; byteSize: number }) => {
  if (!clubPhotoMimeTypes.includes(asset.mimeType)) return "Use a JPEG, PNG or HEIC photo.";
  if (asset.byteSize > clubPhotoMaxBytes) return "This photo is over 50 MB. Pick a smaller one.";
  return undefined;
};
