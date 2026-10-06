import { useCallback, useEffect, useRef, useState } from "react";
import type { ClubCommentWithAuthor, ClubFeedItem, ClubSpace, EquinaBackend, UploadAsset } from "../../backend";
import { clubErrorMessage, isDuplicateReport, type ClubReportReason } from "./club-format";
import {
  allScope,
  feedCursor,
  feedQueryForScope,
  mergeFeedPages,
  type ClubFeedScope
} from "./club-groups";

const feedSize = 30;
// Several riders acting at once arrive as a burst of change events. One
// reload after the burst is enough.
const realtimeSettleMs = 700;

export type ClubPostResult = { published: boolean; photoFailed: boolean } | null;

export function useClub({
  backend,
  enabled
}: {
  backend: EquinaBackend | null;
  enabled: boolean;
}) {
  const [spaces, setSpaces] = useState<ClubSpace[]>([]);
  const [scope, setScope] = useState<ClubFeedScope>(allScope);
  const [joinedSpaceIds, setJoinedSpaceIds] = useState<string[]>([]);
  const [items, setItems] = useState<ClubFeedItem[]>([]);
  // A full page means older posts may exist; the next page says for sure.
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  // Only the newest load may write the feed: switching spaces quickly would
  // otherwise let a slow earlier response overwrite the space now on screen.
  const latestLoad = useRef(0);
  // The memberships the feed query reads, without waiting for a render.
  const joinedRef = useRef<string[]>([]);
  joinedRef.current = joinedSpaceIds;

  const loadFeed = useCallback(async (targetScope: ClubFeedScope) => {
    if (!backend || !enabled) return;
    const request = ++latestLoad.current;
    setLoading(true);
    try {
      const query = feedQueryForScope(targetScope, joinedRef.current);
      const page = query ? await backend.club.feedPage(query, feedSize) : [];
      if (request !== latestLoad.current) return;
      setItems(page);
      setHasMore(page.length >= feedSize);
      setError("");
      setLoaded(true);
    } catch (cause) {
      if (request === latestLoad.current) {
        setError(clubErrorMessage(cause, "The Club feed could not be loaded."));
      }
    } finally {
      if (request === latestLoad.current) setLoading(false);
    }
  }, [backend, enabled]);

  const refresh = useCallback(() => loadFeed(scope), [loadFeed, scope]);

  const selectScope = useCallback((next: ClubFeedScope) => {
    setScope(next);
    void loadFeed(next);
  }, [loadFeed]);

  /**
   * Appends the page before the oldest item on screen. It does not claim the
   * feed: a refresh or realtime reload that lands meanwhile replaces the first
   * page and this older page is dropped, so the two never interleave. The
   * trade-off is that a reload while reading far down jumps back to page one;
   * the rider loads more again.
   */
  const loadMore = useCallback(async () => {
    if (!backend || !enabled || loadingMore || !hasMore) return;
    const request = latestLoad.current;
    const before = feedCursor(items);
    const query = feedQueryForScope(scope, joinedRef.current);
    if (!before || !query) return;
    setLoadingMore(true);
    try {
      const page = await backend.club.feedPage(query, feedSize, before);
      if (request !== latestLoad.current) return;
      setItems((current) => mergeFeedPages(current, page));
      setHasMore(page.length >= feedSize);
    } catch (cause) {
      if (request === latestLoad.current) setError(clubErrorMessage(cause, "Older posts could not be loaded."));
    } finally {
      setLoadingMore(false);
    }
  }, [backend, enabled, hasMore, items, loadingMore, scope]);

  useEffect(() => {
    if (!backend || !enabled) {
      setItems([]);
      setSpaces([]);
      setJoinedSpaceIds([]);
      setScope(allScope);
      setHasMore(false);
      setLoaded(false);
      return;
    }
    let active = true;
    void backend.club.spaces().then(
      (next) => { if (active) setSpaces(next); },
      (cause: unknown) => { if (active) setError(clubErrorMessage(cause, "Club spaces could not be loaded.")); }
    );
    void backend.club.myMemberships().then(
      (next) => { if (active) setJoinedSpaceIds(next); },
      (cause: unknown) => { if (active) setError(clubErrorMessage(cause, "Your groups could not be loaded.")); }
    );
    void loadFeed(allScope);
    return () => { active = false; };
  }, [backend, enabled, loadFeed]);

  // Another rider posting, liking or commenting reloads the feed on its own,
  // so two riders see each other without pulling to refresh. "My groups" and
  // "All" listen to every space; the reload applies the filter.
  useEffect(() => {
    if (!backend || !enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settle = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void loadFeed(scope), realtimeSettleMs);
    };
    const stopPosts = backend.club.subscribe(scope.kind === "space" ? scope.spaceId : undefined, settle);
    const stopActivity = backend.club.subscribeActivity(settle);
    return () => {
      if (timer) clearTimeout(timer);
      stopPosts();
      stopActivity();
    };
  }, [backend, enabled, loadFeed, scope]);

  const createPost = useCallback(async (input: {
    spaceId: string;
    body: string;
    rideId?: string;
    horseId?: string;
    photo?: UploadAsset;
  }): Promise<ClubPostResult> => {
    if (!backend || !enabled) return null;
    setBusy("post");
    setError("");
    try {
      const post = await backend.club.createPost({
        spaceId: input.spaceId,
        postType: input.rideId ? "ride" : input.photo ? "photo" : "journal",
        body: input.body,
        rideId: input.rideId,
        horseId: input.horseId
      });
      // The post exists before the photo goes up. A failed upload keeps the
      // post and says so; silently dropping the text would be worse.
      let photoFailed = false;
      if (input.photo) {
        try {
          await backend.club.attachMedia(post.id, input.photo, 0);
        } catch {
          photoFailed = true;
        }
      }
      await loadFeed(scope);
      // The phrase filter hides a post on write; its author is told rather
      // than left wondering why it never appeared.
      return { published: post.moderationStatus === "visible", photoFailed };
    } catch (cause) {
      setError(clubErrorMessage(cause, "Your post could not be shared."));
      return null;
    } finally {
      setBusy("");
    }
  }, [backend, enabled, loadFeed, scope]);

  const toggleLike = useCallback(async (postId: string) => {
    if (!backend || !enabled) return;
    const item = items.find((entry) => entry.post.id === postId);
    if (!item) return;
    const liked = Boolean(item.myReaction);
    const apply = (like: boolean) => setItems((current) => current.map((entry) =>
      entry.post.id === postId
        ? {
            ...entry,
            myReaction: like ? "like" : undefined,
            reactionCount: Math.max(0, entry.reactionCount + (like ? 1 : -1))
          }
        : entry
    ));
    // Shown at once; undone if the server refuses.
    apply(!liked);
    try {
      if (liked) await backend.club.removeReaction(postId);
      else await backend.club.react(postId, "like");
    } catch (cause) {
      apply(liked);
      setError(clubErrorMessage(cause, "Your reaction could not be saved."));
    }
  }, [backend, enabled, items]);

  // Joining is a bookmark, not a key: public spaces stay readable either way.
  // Shown at once; undone if the server refuses.
  const setMembership = useCallback(async (spaceId: string, joined: boolean) => {
    if (!backend || !enabled) return false;
    const apply = (member: boolean) => {
      const without = joinedRef.current.filter((id) => id !== spaceId);
      // Written to the ref at once so a reload in the same tick sees it.
      joinedRef.current = member ? [...without, spaceId] : without;
      setJoinedSpaceIds(joinedRef.current);
    };
    apply(joined);
    try {
      if (joined) await backend.club.joinSpace(spaceId);
      else await backend.club.leaveSpace(spaceId);
      // "My groups" is on screen: it has to follow the membership.
      if (scope.kind === "mine") void loadFeed(scope);
      return true;
    } catch (cause) {
      apply(!joined);
      setError(clubErrorMessage(cause, joined ? "The group could not be joined." : "The group could not be left."));
      return false;
    }
  }, [backend, enabled, loadFeed, scope]);

  const joinSpace = useCallback((spaceId: string) => setMembership(spaceId, true), [setMembership]);
  const leaveSpace = useCallback((spaceId: string) => setMembership(spaceId, false), [setMembership]);

  const loadComments = useCallback(async (postId: string): Promise<ClubCommentWithAuthor[] | null> => {
    if (!backend || !enabled) return null;
    try {
      return await backend.club.commentThread(postId);
    } catch (cause) {
      setError(clubErrorMessage(cause, "Comments could not be loaded."));
      return null;
    }
  }, [backend, enabled]);

  const adjustCommentCount = (postId: string, delta: number) => setItems((current) => current.map((entry) =>
    entry.post.id === postId ? { ...entry, commentCount: Math.max(0, entry.commentCount + delta) } : entry
  ));

  const addComment = useCallback(async (
    postId: string,
    body: string,
    authorName: string
  ): Promise<ClubCommentWithAuthor | null> => {
    if (!backend || !enabled) return null;
    setBusy(`comment:${postId}`);
    setError("");
    try {
      const comment = await backend.club.comment(postId, body);
      if (comment.moderationStatus === "visible") adjustCommentCount(postId, 1);
      return { ...comment, authorName };
    } catch (cause) {
      setError(clubErrorMessage(cause, "Your comment could not be posted."));
      return null;
    } finally {
      setBusy("");
    }
  }, [backend, enabled]);

  const deleteComment = useCallback(async (postId: string, commentId: string) => {
    if (!backend || !enabled) return false;
    try {
      await backend.club.deleteComment(commentId);
      adjustCommentCount(postId, -1);
      return true;
    } catch (cause) {
      setError(clubErrorMessage(cause, "The comment could not be deleted."));
      return false;
    }
  }, [backend, enabled]);

  const deletePost = useCallback(async (postId: string) => {
    if (!backend || !enabled) return false;
    setBusy(`delete:${postId}`);
    try {
      await backend.club.deletePost(postId);
      setItems((current) => current.filter((entry) => entry.post.id !== postId));
      return true;
    } catch (cause) {
      setError(clubErrorMessage(cause, "The post could not be deleted."));
      return false;
    } finally {
      setBusy("");
    }
  }, [backend, enabled]);

  const report = useCallback(async (
    target: { postId: string } | { commentId: string },
    reason: ClubReportReason
  ) => {
    if (!backend || !enabled) return false;
    try {
      await backend.club.report({ ...target, reason });
    } catch (cause) {
      // Reporting twice is not a failure; the first report stands.
      if (!isDuplicateReport(cause)) {
        setError(clubErrorMessage(cause, "The report could not be sent."));
        return false;
      }
    }
    // Whoever reports a post should not have to keep looking at it.
    if ("postId" in target) {
      setItems((current) => current.filter((entry) => entry.post.id !== target.postId));
    }
    return true;
  }, [backend, enabled]);

  const block = useCallback(async (userId: string) => {
    if (!backend || !enabled) return false;
    try {
      await backend.club.block(userId);
      setItems((current) => current.filter((entry) => entry.author.id !== userId));
      return true;
    } catch (cause) {
      setError(clubErrorMessage(cause, "This rider could not be blocked."));
      return false;
    }
  }, [backend, enabled]);

  return {
    enabled,
    spaces,
    scope,
    /** The one space on screen, when the feed is filtered to one. */
    spaceId: scope.kind === "space" ? scope.spaceId : undefined,
    joinedSpaceIds,
    items,
    hasMore,
    loading,
    loadingMore,
    loaded,
    busy,
    error,
    clearError: () => setError(""),
    refresh,
    selectScope,
    loadMore,
    createPost,
    joinSpace,
    leaveSpace,
    toggleLike,
    loadComments,
    addComment,
    deleteComment,
    deletePost,
    report,
    block
  };
}

export type ClubController = ReturnType<typeof useClub>;
