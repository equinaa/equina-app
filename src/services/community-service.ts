import { z } from "zod";
import type { CommunityPost } from "../domain/types";
import { createId } from "./id";
import type { EquinaStore } from "./store";

const postSchema = z.object({
  authorId: z.string(),
  space: z.enum(["dressage", "jumping", "eventing", "western", "endurance", "trail", "local_ro", "coach_qna"]),
  postType: z.enum(["short_video", "photo", "journal", "question", "listing_story"]),
  title: z.string().min(4),
  body: z.string().min(8),
  linkedListingId: z.string().optional(),
  linkedHorseId: z.string().optional()
});

const blockedMedicalPhrases = ["diagnose", "laminitis cure", "colic treatment", "ignore the vet"];

export class CommunityService {
  constructor(private readonly store: EquinaStore) {}

  createPost(input: unknown): CommunityPost {
    const data = postSchema.parse(input);
    const text = `${data.title} ${data.body}`.toLowerCase();
    const needsModeration = blockedMedicalPhrases.some((phrase) => text.includes(phrase));

    const post: CommunityPost = {
      id: createId("post"),
      ...data,
      moderationStatus: needsModeration ? "pending" : "visible",
      createdAt: new Date().toISOString()
    };

    this.store.posts.push(post);
    return post;
  }

  listVisiblePosts(space?: CommunityPost["space"]): CommunityPost[] {
    return this.store.posts.filter((post) => post.moderationStatus === "visible" && (!space || post.space === space));
  }
}
