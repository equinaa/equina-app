export type Currency = "EUR" | "USD" | "GBP";

export type UserRole =
  | "rider"
  | "seller"
  | "verified_seller"
  | "coach"
  | "verified_coach"
  | "moderator"
  | "admin";

export type SellerVerificationStatus =
  | "unstarted"
  | "identity_pending"
  | "payout_pending"
  | "verified"
  | "limited"
  | "suspended";

export type Discipline =
  | "dressage"
  | "jumping"
  | "eventing"
  | "western"
  | "endurance"
  | "trail";

export type ListingCategory =
  | "saddle"
  | "bridle"
  | "bit"
  | "girth"
  | "stirrup"
  | "boot"
  | "pad"
  | "blanket"
  | "helmet"
  | "apparel"
  | "grooming"
  | "training_aid"
  | "transport";

export type SaddleType = "dressage" | "jumping" | "gp" | "pony" | "western";
export type ConditionGrade = "new" | "like_new" | "good" | "fair" | "for_parts";
export type ListingStatus = "draft" | "pending_review" | "active" | "sold" | "rejected";
export type OrderStatus = "payment_pending" | "paid" | "shipped" | "inspection" | "released" | "disputed" | "refunded";
export type Confidence = "high" | "medium" | "low";

export interface AuthSession {
  token: string;
  userId: string;
  expiresAt: string;
}

export interface User {
  id: string;
  email: string;
  phone?: string;
  locale: "ro" | "en" | "hu";
  roles: UserRole[];
  createdAt: string;
}

export interface Profile {
  userId: string;
  displayName: string;
  location: string;
  discipline: Discipline;
  skillLevel: "beginner" | "intermediate" | "advanced" | "pro";
  bio?: string;
  avatarUrl?: string;
}

export interface SellerVerification {
  userId: string;
  status: SellerVerificationStatus;
  idVerifiedAt?: string;
  payoutVerifiedAt?: string;
  riskLevel: "low" | "medium" | "high";
}

export interface Horse {
  id: string;
  ownerId: string;
  name: string;
  breed?: string;
  heightCm?: number;
  discipline: Discipline;
  ageYears?: number;
  measurements?: {
    witherHeightCm?: number;
    backLengthCm?: number;
    shoulderAngle?: "upright" | "average" | "sloped";
  };
}

export interface ListingPhoto {
  id: string;
  url: string;
  requiredAngle: string;
  approvedAt?: string;
}

export interface Listing {
  id: string;
  sellerId: string;
  category: ListingCategory;
  title: string;
  brand: string;
  model?: string;
  conditionGrade: ConditionGrade;
  priceAmount: number;
  currency: Currency;
  status: ListingStatus;
  location: string;
  photos: ListingPhoto[];
  metadata?: {
    saddleType?: SaddleType;
    treeSize?: string;
    flapSize?: string;
    seatSize?: string;
    serialNumber?: string;
    proofOfOwnership?: boolean;
    impactHistory?: boolean;
    safetyCertificationExpiresAt?: string;
  };
  createdAt: string;
}

export interface Order {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  amount: number;
  currency: Currency;
  status: OrderStatus;
  inspectionEndsAt?: string;
  providerPaymentId?: string;
}

export interface Dispute {
  id: string;
  orderId: string;
  openedBy: string;
  reason: "misrepresented" | "counterfeit_suspected" | "damaged" | "not_received";
  status: "open" | "awaiting_seller" | "under_review" | "resolved";
  evidenceUrls: string[];
  resolution?: "release" | "partial_refund" | "return_refund" | "refund";
}

export interface Review {
  id: string;
  orderId: string;
  reviewerId: string;
  revieweeId: string;
  rating: 1 | 2 | 3 | 4 | 5;
  body?: string;
  verified: boolean;
}

export interface CommunityPost {
  id: string;
  authorId: string;
  space: Discipline | "local_ro" | "coach_qna";
  postType: "short_video" | "photo" | "journal" | "question" | "listing_story";
  title: string;
  body: string;
  linkedListingId?: string;
  linkedHorseId?: string;
  moderationStatus: "visible" | "pending" | "hidden";
  createdAt: string;
}

export interface AiOutput {
  taskType: "session_summary" | "workload_pattern" | "plan_suggestion" | "health_alert" | "education_recommendation" | "saddle_fit_guidance";
  summary: string;
  confidence: Confidence;
  basedOn: string[];
  safetyFlags: string[];
  disclaimer?: string;
}
