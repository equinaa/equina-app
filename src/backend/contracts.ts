import type { Discipline } from "../domain/types";

export type BackendCapabilities = {
  auth: boolean;
  accountSettings: boolean;
  coachChat: boolean;
  pushNotifications: boolean;
  records: boolean;
  horseManagement: boolean;
  rideLogging: boolean;
  clubPublishing: boolean;
  clubInteractions: boolean;
  listingCreation: boolean;
  messaging: boolean;
  checkout: boolean;
};

export type BackendStatus = "unconfigured" | "connecting" | "ready" | "error";

export type ProfileRecord = {
  id: string;
  displayName: string;
  avatarPath?: string;
  avatarUrl?: string;
  locale: string;
  location?: string;
  discipline?: Discipline;
  skillLevel?: "beginner" | "intermediate" | "advanced" | "pro";
  onboardingCompletedAt?: string;
};

export type UserPreferencesRecord = {
  userId: string;
  academyDiscipline?: Discipline;
  academyLevel?: "beginner" | "intermediate" | "advanced" | "pro";
  academyFocus?: string;
  useRiderProfile: boolean;
  useSelectedHorse: boolean;
  useRideHistory: boolean;
  reducedPersonalization: boolean;
  version: number;
  updatedAt: string;
};

export type NotificationPreferencesRecord = {
  userId: string;
  humanMessages: boolean;
  orderChanges: boolean;
  horseReminders: boolean;
  academyReminders: boolean;
  messagePreviews: boolean;
  quietHoursTimezone: string;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  updatedAt: string;
};

export type AccountDeletionRequestRecord = {
  id: string;
  userId: string;
  reason?: string;
  requestedAt: string;
  scheduledFor: string;
  canceledAt?: string;
  completedAt?: string;
};

export type AccountSnapshot = {
  userId: string;
  email: string;
  emailVerified: boolean;
  profile: ProfileRecord;
  primaryHorse?: HorseRecord;
  preferences: UserPreferencesRecord;
  notifications: NotificationPreferencesRecord;
  deletionRequest?: AccountDeletionRequestRecord;
};

export type BlockedAccountRecord = {
  id: string;
  displayName: string;
  avatarPath?: string;
  blockedAt: string;
};

export type DataExportRecord = {
  id: string;
  status: "ready";
  signedUrl: string;
  expiresAt: string;
};

export type CoachConversationRecord = {
  id: string;
  userId: string;
  selectedHorseId?: string;
  title: string;
  focus: string;
  load: string;
  style: string;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type CoachMessageRecord = {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  body: string;
  clientNonce: string;
  status: "pending" | "complete" | "failed" | "blocked";
  basedOn: string[];
  confidence?: "high" | "medium" | "low";
  safetyCategory: "none" | "health_escalation" | "welfare_escalation" | "unsafe_request" | "provider_review";
  publicMetadata: Record<string, unknown>;
  createdAt: string;
};

export type CoachSendResult = {
  conversation: CoachConversationRecord;
  userMessage: CoachMessageRecord;
  assistantMessage: CoachMessageRecord;
  idempotent: boolean;
};

export type PushDeviceRecord = {
  id: string;
  platform: "ios" | "android";
  appVersion: string;
  lastSeenAt: string;
};

export type HorseRecord = {
  id: string;
  ownerId: string;
  name: string;
  breed?: string;
  discipline?: Discipline;
  birthDate?: string;
  sex?: "mare" | "gelding" | "stallion" | "unknown";
  heightCm?: number;
  photoPath?: string;
  photoUrl?: string;
  isPrimary: boolean;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type HorseTimelineRecord = {
  id: string;
  horseId: string;
  createdBy: string;
  recordType: "passport" | "vet" | "lab" | "vaccination" | "dental" | "farrier" | "nutrition" | "care" | "note";
  status: "current" | "due" | "expired" | "archived";
  title: string;
  occurredOn: string;
  dueOn?: string;
  providerName?: string;
  notes?: string;
  source: "rider" | "vet" | "lab" | "nutritionist" | "coach" | "stable" | "import";
  details: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type HorseCollaborator = {
  horseId: string;
  userId: string;
  accessRole: "viewer" | "editor";
  invitedBy: string;
  acceptedAt?: string;
  createdAt: string;
};

export type HorseRecordFile = {
  id: string;
  recordId: string;
  uploadedBy: string;
  objectPath: string;
  originalName: string;
  mimeType: string;
  byteSize: number;
  createdAt: string;
  signedUrl?: string;
};

export type ClubSpace = { id: string; slug: string; name: string; description?: string; discipline?: Discipline; isPrivate: boolean };
export type ClubPostRecord = {
  id: string;
  authorId: string;
  spaceId: string;
  postType: "ride" | "photo" | "video" | "journal" | "question";
  body: string;
  horseId?: string;
  rideId?: string;
  moderationStatus: "draft" | "pending" | "visible" | "hidden" | "deleted";
  createdAt: string;
  updatedAt: string;
};
export type ClubCommentRecord = { id: string; postId: string; authorId: string; parentId?: string; body: string; moderationStatus: string; createdAt: string };
export type ClubMediaRecord = { id: string; postId: string; mediaType: "image" | "video"; mimeType: string; objectPath: string; position: number; signedUrl: string };
export type ClubFeedItem = {
  post: ClubPostRecord;
  author: { id: string; displayName: string; avatarPath?: string; avatarUrl?: string };
  media: ClubMediaRecord[];
  reactionCount: number;
  commentCount: number;
  myReaction?: "like" | "support" | "insightful";
};

export type ListingRecord = {
  id: string;
  sellerId: string;
  category: string;
  title: string;
  description: string;
  brandName: string;
  model?: string;
  conditionGrade: string;
  priceMinor: number;
  currency: "EUR" | "USD" | "GBP";
  countryCode: string;
  locality: string;
  metadata: Record<string, unknown>;
  status: "draft" | "pending_review" | "active" | "reserved" | "sold" | "rejected" | "archived";
  publishedAt?: string;
  createdAt: string;
  photos?: ListingPhotoRecord[];
};
export type ListingPhotoRecord = { id: string; listingId: string; objectPath: string; requiredAngle: string; position: number; signedUrl?: string };
export type MarketplaceCategoryRule = { category: string; requiredPhotoAngles: string[]; maxPhotoCount: number; permitsForParts: boolean; safetyNotice?: string };
export type MarketplaceBrand = { id: string; name: string; website?: string; isVerified: boolean };
export type ListingShippingRate = { id: string; listingId: string; countryCode: string; serviceName: string; amountMinor: number; minDays: number; maxDays: number; tracked: boolean; insuredUpToMinor: number };
export type MarketplaceConversation = { id: string; listingId: string; buyerId: string; sellerId: string; lastMessageAt: string };
export type MarketplaceMessage = { id: string; conversationId: string; senderId: string; clientNonce: string; body: string; deliveryStatus: "sent" | "delivered" | "read"; readAt?: string; createdAt: string };
export type MarketplaceThread = {
  conversation: MarketplaceConversation;
  listing: { id: string; title: string; photoUrl?: string };
  participant: { id: string; displayName: string; avatarUrl?: string };
  lastMessage?: MarketplaceMessage;
  unreadCount: number;
};
export type CheckoutQuote = {
  id: string; listingId: string; itemAmountMinor: number; shippingAmountMinor: number;
  taxAmountMinor: number; protectionFeeMinor: number; totalAmountMinor: number;
  currency: string; expiresAt: string; taxBasis: string;
  shipping?: { service: string; minDays: number; maxDays: number; tracked: boolean };
};
export type MarketplaceOrder = {
  id: string; listingId: string; buyerId: string; sellerId: string;
  itemAmountMinor: number; shippingAmountMinor: number; taxAmountMinor: number;
  protectionFeeMinor: number; totalAmountMinor: number; sellerNetMinor: number;
  currency: string; shippingAddress: Record<string, unknown>; status: string;
  marketplaceTermsVersion: string; termsAcceptedAt: string;
  inspectionEndsAt?: string; paidAt?: string; shippedAt?: string; completedAt?: string;
  createdAt: string;
};
export type SellerAccount = {
  userId: string;
  sellerType: "private" | "business";
  countryCode: string;
  verificationStatus: "unstarted" | "identity_pending" | "payout_pending" | "verified" | "limited" | "suspended";
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
};
export type SellerPublicProfile = {
  userId: string;
  displayName: string;
  avatarPath?: string;
  avatarUrl?: string;
  countryCode: string;
  verificationStatus: SellerAccount["verificationStatus"];
  memberSince: string;
  ratingAverage?: number;
  reviewCount: number;
  completedSales: number;
};
export type OrderEvent = { id: number; orderId: string; fromStatus?: string; toStatus: string; detail: Record<string, unknown>; createdAt: string };
export type ShipmentRecord = { id: string; orderId: string; carrier: string; service?: string; trackingNumber: string; trackingUrl?: string; insuredAmountMinor: number; deliveredAt?: string; createdAt: string };
export type MarketplaceDispute = { id: string; orderId: string; openedBy: string; reason: string; detail: string; status: string; resolution?: string; refundAmountMinor?: number; createdAt: string };
export type DisputeEvidenceRecord = { id: string; disputeId: string; uploadedBy: string; objectPath: string; mimeType: string; byteSize: number; note?: string; signedUrl: string; createdAt: string };
export type MarketplaceReview = { id: string; orderId: string; reviewerId: string; revieweeId: string; rating: number; body?: string; verified: boolean; createdAt: string };
export type MarketplaceReportReason = "scam" | "counterfeit" | "unsafe_item" | "harassment" | "spam" | "prohibited_item" | "other";

export type UploadAsset = {
  uri: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
};

export type UploadKind = "avatar" | "horse_photo" | "horse_record" | "club_post" | "listing_photo" | "dispute_evidence";

export type RideMoodRecord = "fresh" | "focused" | "tender";

export type RideEntry = {
  id: string;
  riderId: string;
  horseId?: string;
  discipline: Discipline;
  focus: string;
  plannedDuration?: string;
  startedAt: string;
  completedAt: string;
  elapsedSeconds: number;
  completedPhases: number;
  totalPhases: number;
  mood?: RideMoodRecord;
  riderNote?: string;
  createdAt: string;
  updatedAt: string;
};

export type RideEntryInput = Omit<RideEntry, "id" | "riderId" | "createdAt" | "updatedAt">;
