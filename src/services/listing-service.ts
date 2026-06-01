import { z } from "zod";
import { bannedListingReasons, requiredPhotoAngles } from "../domain/catalog";
import type { Listing, ListingPhoto, SellerVerification } from "../domain/types";
import { createId } from "./id";
import type { EquinaStore } from "./store";

const listingSchema = z.object({
  sellerId: z.string(),
  category: z.enum([
    "saddle",
    "bridle",
    "bit",
    "girth",
    "stirrup",
    "boot",
    "pad",
    "blanket",
    "helmet",
    "apparel",
    "grooming",
    "training_aid",
    "transport"
  ]),
  title: z.string().min(8),
  brand: z.string().min(2),
  model: z.string().optional(),
  conditionGrade: z.enum(["new", "like_new", "good", "fair", "for_parts"]),
  priceAmount: z.number().positive(),
  currency: z.enum(["EUR", "USD", "GBP"]),
  location: z.string().min(2),
  photos: z.array(
    z.object({
      url: z.string().url(),
      requiredAngle: z.string()
    })
  ),
  metadata: z
    .object({
      saddleType: z.enum(["dressage", "jumping", "gp", "pony", "western"]).optional(),
      treeSize: z.string().optional(),
      flapSize: z.string().optional(),
      seatSize: z.string().optional(),
      serialNumber: z.string().optional(),
      proofOfOwnership: z.boolean().optional(),
      impactHistory: z.boolean().optional(),
      safetyCertificationExpiresAt: z.string().optional()
    })
    .optional()
});

export class ListingService {
  constructor(private readonly store: EquinaStore) {}

  createListing(input: unknown): Listing {
    const data = listingSchema.parse(input);
    const verification = this.getSellerVerification(data.sellerId);
    this.assertListingIsAllowed(data, verification);

    const listing: Listing = {
      id: createId("lst"),
      ...data,
      photos: data.photos.map((photo) => ({ id: createId("photo"), ...photo }) satisfies ListingPhoto),
      status: this.needsManualReview(data, verification) ? "pending_review" : "active",
      createdAt: new Date().toISOString()
    };

    this.store.listings.push(listing);
    return listing;
  }

  updateListing(id: string, input: Partial<Listing>): Listing {
    const listing = this.store.listings.find((candidate) => candidate.id === id);
    if (!listing) throw new Error("Listing not found");
    Object.assign(listing, input);
    return listing;
  }

  deleteListing(id: string): void {
    this.store.listings = this.store.listings.filter((listing) => listing.id !== id);
  }

  private getSellerVerification(userId: string): SellerVerification | undefined {
    return this.store.sellerVerifications.find((verification) => verification.userId === userId);
  }

  private assertListingIsAllowed(data: z.infer<typeof listingSchema>, verification?: SellerVerification): void {
    const requiredAngles = requiredPhotoAngles[data.category];
    const submittedAngles = new Set(data.photos.map((photo) => photo.requiredAngle));
    const missingAngles = requiredAngles.filter((angle) => !submittedAngles.has(angle));

    if (missingAngles.length > 0) {
      throw new Error(`Missing required photos: ${missingAngles.join(", ")}`);
    }

    if (data.category === "helmet" && data.metadata?.impactHistory) {
      throw new Error(bannedListingReasons.brokenHelmet);
    }

    if (data.category === "saddle" && data.priceAmount >= 1000 && data.currency === "EUR") {
      if (verification?.status !== "verified") {
        throw new Error("High-value saddle listings require verified seller status.");
      }
      if (!data.metadata?.serialNumber || !data.metadata.proofOfOwnership) {
        throw new Error("High-value saddles require serial number and proof-of-ownership attestation.");
      }
    }
  }

  private needsManualReview(data: z.infer<typeof listingSchema>, verification?: SellerVerification): boolean {
    return verification?.riskLevel === "high" || (data.category === "saddle" && data.priceAmount >= 1000 && data.currency === "EUR");
  }
}
