import { useCallback, useEffect, useRef, useState } from "react";
import type { ClubCommentWithAuthor, ClubFeedItem, ClubSpace, EquinaBackend } from "../../backend";
import { clubErrorMessage, isDuplicateReport, type ClubReportReason } from "./club-format";

const feedSize = 30;
// Several riders acting at once arrive as a burst of change events. One
// reload after the burst is enough.
const realtimeSettleMs = 700;

export type ClubPostResult = { published: boolean } | null;

export function useClub({
  backend,
  enabled
}: {
  backend: EquinaBackend | null;
  enabled: boolean;
}) {
  const [spaces, setSpaces] = useState<ClubSpace[]>([]);
  // undefined is every space the rider can read.
  const [spaceId, setSpaceId] = useState<string | undefined>(undefined);
  const [items, setItems] = useState<ClubFeedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  // Only the newest load may write the feed: switching spaces quickly would
  // otherwise let a slow earlier response overwrite the space now on screen.
  const latestLoad = useRef(0);

  const loadFeed = useCallback(async (targetSpaceId: string | undefined) => {
    if (!backend || !enabled) return;
    const request = ++latestLoad.current;
    setLoading(true);
    try {
      const page = await backend.club.feedPage(targetSpaceId, feedSize);
      if (request !== latestLoad.current) return;
      setItems(page);
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

  const refresh = useCallback(() => loadFeed(spaceId), [loadFeed, spaceId]);

  const selectSpace = useCallback((next: string | undefined) => {
    setSpaceId(next);
    void loadFeed(next);
  }, [loadFeed]);

  useEffect(() => {
    if (!backend || !enabled) {
      setItems([]);
      setSpaces([]);
      setSpaceId(undefined);
      setLoaded(false);
      return;
    }
    let active = true;
    void backend.club.spaces().then(
      (next) => { if (active) setSpaces(next); },
      (cause: unknown) => { if (active) setError(clubErrorMessage(cause, "Club spaces could not be loaded.")); }
    );
    void loadFeed(undefined);
    return () => { active = false; };
  }, [backend, enabled, loadFeed]);

  // Another rider posting, liking or commenting reloads the feed on its own,
  // so two riders see each other without pulling to refresh.
  useEffect(() => {
    if (!backend || !enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settle = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void loadFeed(spaceId), realtimeSettleMs);
    };
    const stopPosts = backend.club.subscribe(spaceId, settle);
    const stopActivity = backend.club.subscribeActivity(settle);
    return () => {
      if (timer) clearTimeout(timer);
      stopPosts();
      stopActivity();
    };
  }, [backend, enabled, loadFeed, spaceId]);

  const createPost = useCallback(async (input: {
    spaceId: string;
    body: string;
    rideId?: string;
    horseId?: string;
  }): Promise<ClubPostResult> => {
    if (!backend || !enabled) return null;
    setBusy("post");
    setError("");
    try {
      const post = await backend.club.createPost({
        spaceId: input.spaceId,
        postType: input.rideId ? "ride" : "journal",
        body: input.body,
        rideId: input.rideId,
        horseId: input.horseId
      });
      await loadFeed(spaceId);
      // The phrase filter hides a post on write; its author is told rather
      // than left wondering why it never appeared.
      return { published: post.moderationStatus === "visible" };
    } catch (cause) {
      setError(clubErrorMessage(cause, "Your post could not be shared."));
      return null;
    } finally {
      setBusy("");
    }
  }, [backend, enabled, loadFeed, spaceId]);

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
    spaceId,
    items,
    loading,
    loaded,
    busy,
    error,
    clearError: () => setError(""),
    refresh,
    selectSpace,
    createPost,
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
