import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { ClubCommentRecord, ClubFeedItem, ClubMediaRecord, ClubPostRecord, ClubSpace, UploadAsset } from "./contracts";
import { EdgeClient } from "./edge-client";
import { backendError, requireData } from "./errors";
import { UploadRepository } from "./upload-repository";

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

  async feed(spaceId?: string, limit = 20, before?: string): Promise<ClubPostRecord[]> {
    let query = this.client.from("club_posts").select("*").eq("moderation_status", "visible").order("created_at", { ascending: false }).limit(Math.min(50, limit));
    if (spaceId) query = query.eq("space_id", spaceId);
    if (before) query = query.lt("created_at", before);
    const { data, error } = await query;
    if (error) throw backendError(error, "Club feed could not be loaded.");
    return (data ?? []).map((row) => mapPost(row as Record<string, unknown>));
  }

  async feedPage(spaceId?: string, limit = 20, before?: string): Promise<ClubFeedItem[]> {
    const posts = await this.feed(spaceId, limit, before);
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

  async joinSpace(spaceId: string): Promise<void> {
    const { data: auth } = await this.client.auth.getUser();
    if (!auth.user) throw backendError(new Error("Authentication required."), "Authentication required.");
    const { error } = await this.client.from("club_memberships").upsert({ space_id: spaceId, user_id: auth.user.id, role: "member" });
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

  subscribe(spaceId: string | undefined, onChange: () => void): () => void {
    let channel: RealtimeChannel = this.client.channel(`club:${spaceId ?? "all"}`);
    const filter = spaceId ? `space_id=eq.${spaceId}` : undefined;
    channel = channel.on("postgres_changes", { event: "*", schema: "public", table: "club_posts", filter }, onChange);
    channel.subscribe();
    return () => { void this.client.removeChannel(channel); };
  }
}
