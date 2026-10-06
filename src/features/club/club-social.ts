import type { ClubActivityKind, ClubSpace } from "../../backend";

/**
 * A post's comments as a thread: top comments oldest first, each followed by
 * its replies, oldest first. Threads are one level deep (202610060004). A
 * reply whose comment the rider cannot see -- hidden, or from someone blocked
 * -- stands on its own rather than vanishing with it.
 */
export const threadComments = <T extends { id: string; parentId?: string; createdAt: string }>(
  comments: T[]
): Array<T & { depth: 0 | 1 }> => {
  const byTime = [...comments].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const shown = new Set(byTime.map((comment) => comment.id));
  const isReply = (comment: T) => Boolean(comment.parentId && shown.has(comment.parentId));
  const repliesTo = new Map<string, T[]>();
  for (const comment of byTime) {
    if (!isReply(comment)) continue;
    repliesTo.set(comment.parentId!, [...(repliesTo.get(comment.parentId!) ?? []), comment]);
  }
  return byTime
    .filter((comment) => !isReply(comment))
    .flatMap((comment) => [
      { ...comment, depth: 0 as const },
      ...(repliesTo.get(comment.id) ?? []).map((reply) => ({ ...reply, depth: 1 as const }))
    ]);
};

/** What the actor did, after their name: "Mara commented on your post". */
export const activityVerb = (kind: ClubActivityKind) =>
  kind === "comment" ? "commented on your post"
    : kind === "reply" ? "replied to your comment"
      : "liked your post";

/** The groups on a rider's profile, in the order the Club lists them. */
export const profileGroups = (spaces: ClubSpace[], spaceIds: string[]) => {
  const joined = new Set(spaceIds);
  return spaces.filter((space) => joined.has(space.id));
};

/** "1 new" or "12 new" on the bell; nothing at zero; never a wall of digits. */
export const unreadLabel = (count: number) => (count <= 0 ? "" : count > 99 ? "99+" : String(count));
