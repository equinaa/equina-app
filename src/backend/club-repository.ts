import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { ClubActivityItem, ClubCommentRecord, ClubCommentWithAuthor, ClubFeedItem, ClubMediaRecord, ClubPostRecord, ClubRiderProfile, ClubSpace, UploadAsset } from "./contracts";

/** One space, several spaces, or (empty) every space the rider can read; optionally one rider's posts. */
export type ClubFeedQuery = { spaceId?: string; spaceIds?: string[]; authorId?: string };
import { EdgeClient } from "./edge-client";
import { backendError, requireData } from "./errors";
import { UploadRepository } from "./upload-repository";

// Realtime topics must not repeat: removing a channel is asynchronous, so a
// resubscription under the same name could join before the old one has left.
let channelSequence = 0;

const mapSpace = (row: Record<string, unknown>): ClubSpace => ({
  id: String(row.id), slug: String(row.slug), name: String(row.name),
  description: row.description ? String(row.description) : undefined,
  discipline: row.discipline as ClubSpace["discipline"], isPrivate: Boolean(row.is_private)
});

const mapPost = (row: Record<string, unknown>): ClubPostRecord => ({
  id: String(row.id), authorId: String(row.author_id), spaceId: String(row.space_id),
  postType: row.post_type as ClubPostRecord["postType"], body: String(row.body),
  horseId: row.horse_id ? String(row.horse_id) : undefined,
  rideId: row.ride_id ? String(row.ride_id) : undefined,
  moderationStatus: row.moderation_status as ClubPostRecord["moderationStatus"],
  createdAt: String(row.created_at), updatedAt: String(row.updated_at)
});

const mapComment = (row: Record<string, unknown>): ClubCommentRecord => ({
  id: String(row.id), postId: String(row.post_id), authorId: String(row.author_id),
  parentId: row.parent_id ? String(row.parent_id) : undefined, body: String(row.body),
  moderationStatus: String(row.moderation_status), createdAt: String(row.created_at)
});

export class ClubRepository {
  readonly uploads: UploadRepository;
  private readonly edge: EdgeClient;

  constructor(private readonly client: SupabaseClient) {
    this.uploads = new UploadRepository(client);
    this.edge = new EdgeClient(client);
  }

  async spaces(): Promise<ClubSpace[]> {
    const { data, error } = await this.client.from("club_spaces").select("*").order("name");
    if (error) throw backendError(error, "Club spaces could not be loaded.");
    return (data ?? []).map((row) => mapSpace(row as Record<string, unknown>));
  }

  /**
   * Newest first. `scope` narrows to one space or to several ("My groups" is
   * one query, not one per membership); `before` is the created_at cursor of
   * the oldest post already on screen.
   */
  async feed(scope: ClubFeedQuery = {}, limit = 20, before?: string): Promise<ClubPostRecord[]> {
    let query = this.client.from("club_posts").select("*").eq("moderation_status", "visible").order("created_at", { ascending: false }).limit(Math.min(50, limit));
    if (scope.spaceId) query = query.eq("space_id", scope.spaceId);
    else if (scope.spaceIds) query = query.in("space_id", scope.spaceIds);
    if (scope.authorId) query = query.eq("author_id", scope.authorId);
    if (before) query = query.lt("created_at", before);
    const { data, error } = await query;
    if (error) throw backendError(error, "Club feed could not be loaded.");
    return (data ?? []).map((row) => mapPost(row as Record<string, unknown>));
  }

  async feedPage(scope: ClubFeedQuery = {}, limit = 20, before?: string): Promise<ClubFeedItem[]> {
    return await this.hydrate(await this.feed(scope, limit, before));
  }

  /** One post as the feed shows it, for activity and profiles that point at it. */
  async postItem(postId: string): Promise<ClubFeedItem | null> {
    const { data, error } = await this.client.from("club_posts").select("*").eq("id", postId).eq("moderation_status", "visible").maybeSingle();
    if (error) throw backendError(error, "Post could not be loaded.");
    if (!data) return null;
    return (await this.hydrate([mapPost(data as Record<string, unknown>)]))[0] ?? null;
  }

  /** Authors, media, reactions and comment counts for posts already read. */
  private async hydrate(posts: ClubPostRecord[]): Promise<ClubFeedItem[]> {
    if (!posts.length) return [];
    const postIds = posts.map((post) => post.id);
    const authorIds = [...new Set(posts.map((post) => post.authorId))];
    const [{ data: profiles, error: profileError }, { data: media, error: mediaError }, { data: reactions, error: reactionError }, { data: comments, error: commentError }, { data: auth }] = await Promise.all([
      this.client.from("profiles").select("id,display_name,avatar_path").in("id", authorIds),
      this.client.from("club_post_media").select("*").in("post_id", postIds).order("position"),
      this.client.from("club_reactions").select("post_id,user_id,reaction").in("post_id", postIds),
      this.client.from("club_comments").select("id,post_id").in("post_id", postIds).eq("moderation_status", "visible"),
      this.client.auth.getUser()
    ]);
    if (profileError) throw backendError(profileError, "Club authors could not be loaded.");
    if (mediaError) throw backendError(mediaError, "Club media could not be loaded.");
    if (reactionError) throw backendError(reactionError, "Club reactions could not be loaded.");
    if (commentError) throw backendError(commentError, "Club comments could not be loaded.");

    const mediaPaths = (media ?? []).map((entry) => String(entry.object_path));
    const avatarPaths = (profiles ?? []).flatMap((entry) => entry.avatar_path ? [String(entry.avatar_path)] : []);
    const [signedMedia, signedAvatars] = await Promise.all([
      mediaPaths.length ? this.client.storage.from("club-media").createSignedUrls(mediaPaths, 900) : Promise.resolve({ data: [], error: null }),
      avatarPaths.length ? this.client.storage.from("avatars").createSignedUrls(avatarPaths, 900) : Promise.resolve({ data: [], error: null })
    ]);
    if (signedMedia.error) throw backendError(signedMedia.error, "Club media could not be opened.");
    if (signedAvatars.error) throw backendError(signedAvatars.error, "Club avatars could not be opened.");
    const mediaUrls = new Map<string, string>((signedMedia.data ?? []).flatMap((entry) =>
      entry.path && entry.signedUrl ? [[entry.path, entry.signedUrl]] : []
    ));
    const avatarUrls = new Map<string, string>((signedAvatars.data ?? []).flatMap((entry) =>
      entry.path && entry.signedUrl ? [[entry.path, entry.signedUrl]] : []
    ));

    return posts.map((post) => {
      const profile = (profiles ?? []).find((entry) => entry.id === post.authorId);
      const postMedia: ClubMediaRecord[] = (media ?? []).filter((entry) => entry.post_id === post.id).map((entry) => ({
        id: String(entry.id), postId: String(entry.post_id), mediaType: entry.media_type as ClubMediaRecord["mediaType"],
        mimeType: String(entry.mime_type), objectPath: String(entry.object_path), position: Number(entry.position),
        signedUrl: mediaUrls.get(String(entry.object_path)) ?? ""
      }));
      const postReactions = (reactions ?? []).filter((entry) => entry.post_id === post.id);
      const avatarPath = profile?.avatar_path ? String(profile.avatar_path) : undefined;
      return {
        post,
        author: {
          id: post.authorId, displayName: profile?.display_name ? String(profile.display_name) : "Rider",
          avatarPath, avatarUrl: avatarPath ? avatarUrls.get(avatarPath) : undefined
        },
        media: postMedia,
        reactionCount: postReactions.length,
        commentCount: (comments ?? []).filter((entry) => entry.post_id === post.id).length,
        myReaction: postReactions.find((entry) => entry.user_id === auth.user?.id)?.reaction as ClubFeedItem["myReaction"]
      };
    });
  }

  async post(id: string): Promise<ClubPostRecord> {
    const { data, error } = await this.client.from("club_posts").select("*").eq("id", id).single();
    return mapPost(requireData(data as Record<string, unknown> | null, error, "Post could not be loaded."));
  }

  /** The spaces the rider has joined. Reading is open to any plan; joining needs `post` access. */
  async myMemberships(): Promise<string[]> {
    const { data: auth } = await this.client.auth.getUser();
    if (!auth.user) return [];
    const { data, error } = await this.client.from("club_memberships").select("space_id").eq("user_id", auth.user.id);
    if (error) throw backendError(error, "Your groups could not be loaded.");
    return (data ?? []).map((row) => String(row.space_id));
  }

  async joinSpace(spaceId: string): Promise<void> {
    const { data: auth } = await this.client.auth.getUser();
    if (!auth.user) throw backendError(new Error("Authentication required."), "Authentication required.");
    // ON CONFLICT DO NOTHING: a membership held already (joined on another
    // device, or a memberships read that failed) is a join that succeeded.
    // The DO UPDATE path would be refused, since memberships have no UPDATE
    // policy, and the rider would be told Club is closed.
    const { error } = await this.client.from("club_memberships").upsert(
      { space_id: spaceId, user_id: auth.user.id, role: "member" },
      { onConflict: "space_id,user_id", ignoreDuplicates: true }
    );
    if (error) throw backendError(error, "Club could not be joined.");
  }

  async leaveSpace(spaceId: string): Promise<void> {
    const { data: auth } = await this.client.auth.getUser();
    if (!auth.user) return;
    const { error } = await this.client.from("club_memberships").delete().eq("space_id", spaceId).eq("user_id", auth.user.id);
    if (error) throw backendError(error, "Club could not be left.");
  }

  async createPost(input: { spaceId: string; postType: ClubPostRecord["postType"]; body: string; horseId?: string; rideId?: string }): Promise<ClubPostRecord> {
    const { data: auth } = await this.client.auth.getUser();
    if (!auth.user) throw backendError(new Error("Authentication required."), "Authentication required.");
    const { data, error } = await this.client.from("club_posts").insert({
      author_id: auth.user.id, space_id: input.spaceId, post_type: input.postType,
      body: input.body.trim(), horse_id: input.horseId ?? null, ride_id: input.rideId ?? null
    }).select("*").single();
    return mapPost(requireData(data as Record<string, unknown> | null, error, "Post could not be created."));
  }

  async updatePost(id: string, body: string): Promise<ClubPostRecord> {
    const { data, error } = await this.client.from("club_posts").update({ body: body.trim() }).eq("id", id).select("*").single();
    return mapPost(requireData(data as Record<string, unknown> | null, error, "Post could not be updated."));
  }

  async deletePost(id: string): Promise<void> {
    await this.edge.invoke("delete-club-post", { postId: id });
  }

  async attachMedia(postId: string, asset: UploadAsset, position = 0): Promise<{ path: string }> {
    return await this.uploads.upload("club_post", postId, asset, { position });
  }

  async removeMedia(mediaId: string): Promise<void> {
    await this.edge.invoke("delete-upload-asset", { kind: "club_post_media", assetId: mediaId });
  }

  async comments(postId: string): Promise<ClubCommentRecord[]> {
    const { data, error } = await this.client.from("club_comments").select("*").eq("post_id", postId).eq("moderation_status", "visible").order("created_at");
    if (error) throw backendError(error, "Comments could not be loaded.");
    return (data ?? []).map((row) => mapComment(row as Record<string, unknown>));
  }

  /** Comments with their authors' names, oldest first. */
  async commentThread(postId: string): Promise<ClubCommentWithAuthor[]> {
    const comments = await this.comments(postId);
    if (!comments.length) return [];
    const authorIds = [...new Set(comments.map((comment) => comment.authorId))];
    const { data, error } = await this.client.from("profiles").select("id,display_name").in("id", authorIds);
    if (error) throw backendError(error, "Comment authors could not be loaded.");
    const names = new Map((data ?? []).map((row) => [
      String(row.id),
      row.display_name ? String(row.display_name) : "Rider"
    ]));
    return comments.map((comment) => ({ ...comment, authorName: names.get(comment.authorId) ?? "Rider" }));
  }

  async comment(postId: string, body: string, parentId?: string): Promise<ClubCommentRecord> {
    const { data: auth } = await this.client.auth.getUser();
    if (!auth.user) throw backendError(new Error("Authentication required."), "Authentication required.");
    const { data, error } = await this.client.from("club_comments").insert({
      post_id: postId, author_id: auth.user.id, parent_id: parentId ?? null, body: body.trim()
    }).select("*").single();
    return mapComment(requireData(data as Record<string, unknown> | null, error, "Comment could not be posted."));
  }

  async updateComment(id: string, body: string): Promise<ClubCommentRecord> {
    const { data, error } = await this.client.from("club_comments").update({ body: body.trim() }).eq("id", id).select("*").single();
    return mapComment(requireData(data as Record<string, unknown> | null, error, "Comment could not be updated."));
  }

  async deleteComment(id: string): Promise<void> {
    const { error } = await this.client.from("club_comments").delete().eq("id", id);
    if (error) throw backendError(error, "Comment could not be deleted.");
  }

  async react(postId: string, reaction: "like" | "support" | "insightful" = "like"): Promise<void> {
    const { data: auth } = await this.client.auth.getUser();
    if (!auth.user) throw backendError(new Error("Authentication required."), "Authentication required.");
    const { error } = await this.client.from("club_reactions").upsert({ post_id: postId, user_id: auth.user.id, reaction }, { onConflict: "post_id,user_id" });
    if (error) throw backendError(error, "Reaction could not be saved.");
  }

  async removeReaction(postId: string): Promise<void> {
    const { data: auth } = await this.client.auth.getUser();
    if (!auth.user) return;
    const { error } = await this.client.from("club_reactions").delete().eq("post_id", postId).eq("user_id", auth.user.id);
    if (error) throw backendError(error, "Reaction could not be removed.");
  }

  async report(input: { postId?: string; commentId?: string; userId?: string; reason: string; detail?: string }): Promise<void> {
    const { data: auth } = await this.client.auth.getUser();
    if (!auth.user) throw backendError(new Error("Authentication required."), "Authentication required.");
    const { error } = await this.client.from("content_reports").insert({
      reporter_id: auth.user.id, post_id: input.postId ?? null, comment_id: input.commentId ?? null,
      reported_user_id: input.userId ?? null, reason: input.reason, detail: input.detail?.trim() || null
    });
    if (error) throw backendError(error, "Report could not be submitted.");
  }

  async block(userId: string): Promise<void> {
    const { data: auth } = await this.client.auth.getUser();
    if (!auth.user) throw backendError(new Error("Authentication required."), "Authentication required.");
    const { error } = await this.client.from("user_blocks").upsert({ blocker_id: auth.user.id, blocked_id: userId });
    if (error) throw backendError(error, "This account could not be blocked.");
  }

  async unblock(userId: string): Promise<void> {
    const { data: auth } = await this.client.auth.getUser();
    if (!auth.user) return;
    const { error } = await this.client.from("user_blocks").delete().eq("blocker_id", auth.user.id).eq("blocked_id", userId);
    if (error) throw backendError(error, "This account could not be unblocked.");
  }

  /**
   * Another rider as the Club shows them. Profiles expose only a name and a
   * photo to other riders (202610050002); groups and posts are read under the
   * Club's own policies, so blocks and the rider's plan apply.
   */
  async riderProfile(userId: string): Promise<ClubRiderProfile | null> {
    const [{ data: profile, error: profileError }, { data: memberships, error: membershipError }, posts] = await Promise.all([
      this.client.from("profiles").select("id,display_name,avatar_path").eq("id", userId).maybeSingle(),
      this.client.from("club_memberships").select("space_id").eq("user_id", userId),
      this.feedPage({ authorId: userId }, 10)
    ]);
    if (profileError) throw backendError(profileError, "This rider could not be loaded.");
    if (membershipError) throw backendError(membershipError, "This rider's groups could not be loaded.");
    if (!profile) return null;
    const avatarPath = profile.avatar_path ? String(profile.avatar_path) : undefined;
    return {
      id: String(profile.id),
      displayName: profile.display_name ? String(profile.display_name) : "Rider",
      avatarUrl: avatarPath ? await this.avatarUrl(avatarPath) : undefined,
      spaceIds: (memberships ?? []).map((row) => String(row.space_id)),
      posts
    };
  }

  /** The rider's Club activity, newest first, with who did it and what they wrote. */
  async activity(limit = 40): Promise<ClubActivityItem[]> {
    const { data, error } = await this.client.from("club_activity")
      .select("id,kind,post_id,comment_id,actor_id,created_at,read_at")
      .order("created_at", { ascending: false })
      .limit(Math.min(100, limit));
    if (error) throw backendError(error, "Club activity could not be loaded.");
    const rows = data ?? [];
    if (!rows.length) return [];
    const actorIds = [...new Set(rows.map((row) => String(row.actor_id)))];
    const commentIds = rows.flatMap((row) => row.comment_id ? [String(row.comment_id)] : []);
    const likedPostIds = [...new Set(rows.flatMap((row) => row.kind === "like" ? [String(row.post_id)] : []))];
    const [{ data: profiles, error: profileError }, { data: comments, error: commentError }, { data: posts, error: postError }] = await Promise.all([
      this.client.from("profiles").select("id,display_name,avatar_path").in("id", actorIds),
      commentIds.length
        ? this.client.from("club_comments").select("id,body").in("id", commentIds)
        : Promise.resolve({ data: [] as Array<{ id: string; body: string }>, error: null }),
      likedPostIds.length
        ? this.client.from("club_posts").select("id,body").in("id", likedPostIds)
        : Promise.resolve({ data: [] as Array<{ id: string; body: string }>, error: null })
    ]);
    if (profileError) throw backendError(profileError, "Club activity could not be loaded.");
    if (commentError) throw backendError(commentError, "Club activity could not be loaded.");
    if (postError) throw backendError(postError, "Club activity could not be loaded.");
    const avatarPaths = (profiles ?? []).flatMap((row) => row.avatar_path ? [String(row.avatar_path)] : []);
    const signed = avatarPaths.length
      ? await this.client.storage.from("avatars").createSignedUrls(avatarPaths, 900)
      : { data: [], error: null };
    const avatarUrls = new Map<string, string>((signed.data ?? []).flatMap((entry) =>
      entry.path && entry.signedUrl ? [[entry.path, entry.signedUrl]] : []
    ));
    const bodies = new Map<string, string>([
      ...(comments ?? []).map((row) => [String(row.id), String(row.body)] as [string, string]),
      ...(posts ?? []).map((row) => [String(row.id), String(row.body)] as [string, string])
    ]);
    return rows.map((row) => {
      const actor = (profiles ?? []).find((entry) => entry.id === row.actor_id);
      const avatarPath = actor?.avatar_path ? String(actor.avatar_path) : undefined;
      const excerptSource = row.comment_id ? String(row.comment_id) : String(row.post_id);
      return {
        id: String(row.id),
        kind: row.kind as ClubActivityItem["kind"],
        postId: String(row.post_id),
        commentId: row.comment_id ? String(row.comment_id) : undefined,
        createdAt: String(row.created_at),
        read: row.read_at !== null,
        actor: {
          id: String(row.actor_id),
          displayName: actor?.display_name ? String(actor.display_name) : "Rider",
          avatarUrl: avatarPath ? avatarUrls.get(avatarPath) : undefined
        },
        excerpt: bodies.get(excerptSource)
      };
    });
  }

  async unreadActivityCount(): Promise<number> {
    const { count, error } = await this.client.from("club_activity").select("id", { count: "exact", head: true }).is("read_at", null);
    if (error) throw backendError(error, "Club activity could not be counted.");
    return count ?? 0;
  }

  async markActivityRead(): Promise<void> {
    const { error } = await this.client.rpc("mark_club_activity_read");
    if (error) throw backendError(error, "Club activity could not be marked read.");
  }

  /** New activity for this rider, as it is written. */
  subscribeInbox(userId: string, onChange: () => void): () => void {
    const channel = this.client.channel(`club:inbox:${++channelSequence}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "club_activity", filter: `recipient_id=eq.${userId}` }, onChange);
    channel.subscribe();
    return () => { void this.client.removeChannel(channel); };
  }

  private async avatarUrl(path: string): Promise<string | undefined> {
    const { data } = await this.client.storage.from("avatars").createSignedUrl(path, 900);
    return data?.signedUrl ?? undefined;
  }

  subscribe(spaceId: string | undefined, onChange: () => void): () => void {
    let channel: RealtimeChannel = this.client.channel(`club:${spaceId ?? "all"}:${++channelSequence}`);
    const filter = spaceId ? `space_id=eq.${spaceId}` : undefined;
    channel = channel.on("postgres_changes", { event: "*", schema: "public", table: "club_posts", filter }, onChange);
    channel.subscribe();
    return () => { void this.client.removeChannel(channel); };
  }

  /** Any reaction or comment the rider is allowed to see, in any space. */
  subscribeActivity(onChange: () => void): () => void {
    const channel = this.client.channel(`club:activity:${++channelSequence}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "club_reactions" }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "club_comments" }, onChange);
    channel.subscribe();
    return () => { void this.client.removeChannel(channel); };
  }
}
