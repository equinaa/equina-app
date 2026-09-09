import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import * as Crypto from "expo-crypto";
import type {
  CheckoutQuote,
  DisputeEvidenceRecord,
  ListingPhotoRecord,
  ListingRecord,
  ListingShippingRate,
  MarketplaceBrand,
  MarketplaceCategoryRule,
  MarketplaceDispute,
  MarketplaceConversation,
  MarketplaceMessage,
  MarketplaceOrder,
  MarketplaceReportReason,
  MarketplaceReview,
  MarketplaceThread,
  OrderEvent,
  SellerAccount,
  SellerPublicProfile,
  ShipmentRecord,
  UploadAsset
} from "./contracts";
import { EdgeClient } from "./edge-client";
import { backendError, requireData } from "./errors";
import { UploadRepository } from "./upload-repository";

const mapPhoto = (row: Record<string, unknown>): ListingPhotoRecord => ({
  id: String(row.id), listingId: String(row.listing_id), objectPath: String(row.object_path),
  requiredAngle: String(row.required_angle), position: Number(row.position)
});

const mapListing = (row: Record<string, unknown>): ListingRecord => ({
  id: String(row.id), sellerId: String(row.seller_id), category: String(row.category), title: String(row.title),
  description: String(row.description ?? ""), brandName: String(row.brand_name),
  model: row.model ? String(row.model) : undefined, conditionGrade: String(row.condition_grade),
  priceMinor: Number(row.price_minor), currency: row.currency as ListingRecord["currency"],
  countryCode: String(row.country_code), locality: String(row.locality),
  metadata: (row.metadata ?? {}) as Record<string, unknown>, status: row.status as ListingRecord["status"],
  publishedAt: row.published_at ? String(row.published_at) : undefined,
  createdAt: String(row.created_at),
  photos: Array.isArray(row.listing_photos) ? row.listing_photos.map((photo) => mapPhoto(photo as Record<string, unknown>)) : undefined
});

const mapConversation = (row: Record<string, unknown>): MarketplaceConversation => ({
  id: String(row.id), listingId: String(row.listing_id), buyerId: String(row.buyer_id),
  sellerId: String(row.seller_id), lastMessageAt: String(row.last_message_at)
});

const mapMessage = (row: Record<string, unknown>): MarketplaceMessage => ({
  id: String(row.id), conversationId: String(row.conversation_id), senderId: String(row.sender_id),
  clientNonce: String(row.client_nonce), body: String(row.body),
  deliveryStatus: row.delivery_status as MarketplaceMessage["deliveryStatus"],
  readAt: row.read_at ? String(row.read_at) : undefined, createdAt: String(row.created_at)
});

const mapOrder = (row: Record<string, unknown>): MarketplaceOrder => ({
  id: String(row.id), listingId: String(row.listing_id), buyerId: String(row.buyer_id),
  sellerId: String(row.seller_id), itemAmountMinor: Number(row.item_amount_minor),
  shippingAmountMinor: Number(row.shipping_amount_minor), taxAmountMinor: Number(row.tax_amount_minor),
  protectionFeeMinor: Number(row.protection_fee_minor), totalAmountMinor: Number(row.total_amount_minor),
  sellerNetMinor: Number(row.seller_net_minor), currency: String(row.currency), status: String(row.status),
  shippingAddress: (row.shipping_address ?? {}) as Record<string, unknown>,
  marketplaceTermsVersion: String(row.marketplace_terms_version), termsAcceptedAt: String(row.terms_accepted_at),
  inspectionEndsAt: row.inspection_ends_at ? String(row.inspection_ends_at) : undefined,
  paidAt: row.paid_at ? String(row.paid_at) : undefined,
  shippedAt: row.shipped_at ? String(row.shipped_at) : undefined,
  completedAt: row.completed_at ? String(row.completed_at) : undefined,
  createdAt: String(row.created_at)
});

const mapSeller = (row: Record<string, unknown>): SellerAccount => ({
  userId: String(row.user_id), sellerType: row.seller_type as SellerAccount["sellerType"],
  countryCode: String(row.country_code), verificationStatus: row.verification_status as SellerAccount["verificationStatus"],
  payoutsEnabled: Boolean(row.payouts_enabled), detailsSubmitted: Boolean(row.details_submitted)
});

const mapReview = (row: Record<string, unknown>): MarketplaceReview => ({
  id: String(row.id), orderId: String(row.order_id), reviewerId: String(row.reviewer_id),
  revieweeId: String(row.reviewee_id), rating: Number(row.rating),
  body: row.body ? String(row.body) : undefined, verified: Boolean(row.verified), createdAt: String(row.created_at)
});

export class MarketplaceRepository {
  readonly uploads: UploadRepository;
  private readonly edge: EdgeClient;

  constructor(private readonly client: SupabaseClient) {
    this.uploads = new UploadRepository(client);
    this.edge = new EdgeClient(client);
  }

  private async withSignedPhotos(listings: ListingRecord[]): Promise<ListingRecord[]> {
    const paths = [...new Set(listings.flatMap((listing) => (listing.photos ?? []).map((photo) => photo.objectPath)))];
    if (!paths.length) return listings;
    const { data, error } = await this.client.storage.from("listing-media").createSignedUrls(paths, 900);
    if (error) throw backendError(error, "Listing photos could not be loaded.");
    const urls = new Map<string, string>((data ?? []).flatMap((entry) =>
      entry.path && entry.signedUrl ? [[entry.path, entry.signedUrl]] : []
    ));
    return listings.map((listing) => ({
      ...listing,
      photos: listing.photos?.map((photo) => ({ ...photo, signedUrl: urls.get(photo.objectPath) }))
    }));
  }

  async browse(input: { category?: string; search?: string; limit?: number; before?: string } = {}): Promise<ListingRecord[]> {
    let query = this.client.from("listings").select("*,listing_photos(*)").eq("status", "active").order("published_at", { ascending: false }).limit(Math.min(50, input.limit ?? 24));
    if (input.category) query = query.eq("category", input.category);
    const search = input.search?.trim().replace(/[,()%_]/g, " ").replace(/\s+/g, " ");
    if (search) query = query.or(`title.ilike.%${search}%,brand_name.ilike.%${search}%`);
    if (input.before) query = query.lt("published_at", input.before);
    const { data, error } = await query;
    if (error) throw backendError(error, "Listings could not be loaded.");
    return await this.withSignedPhotos((data ?? []).map((row) => mapListing(row as Record<string, unknown>)));
  }

  async categoryRules(): Promise<MarketplaceCategoryRule[]> {
    const { data, error } = await this.client.from("marketplace_category_rules").select("*").order("category");
    if (error) throw backendError(error, "Marketplace categories could not be loaded.");
    return (data ?? []).map((row) => ({
      category: String(row.category),
      requiredPhotoAngles: Array.isArray(row.required_photo_angles) ? row.required_photo_angles.map(String) : [],
      maxPhotoCount: Number(row.max_photo_count), permitsForParts: Boolean(row.permits_for_parts),
      safetyNotice: row.safety_notice ? String(row.safety_notice) : undefined
    }));
  }

  async brands(search?: string): Promise<MarketplaceBrand[]> {
    let query = this.client.from("marketplace_brands").select("*").order("name").limit(100);
    if (search?.trim()) query = query.ilike("name", `%${search.trim()}%`);
    const { data, error } = await query;
    if (error) throw backendError(error, "Marketplace brands could not be loaded.");
    return (data ?? []).map((row) => ({
      id: String(row.id), name: String(row.name), website: row.website ? String(row.website) : undefined,
      isVerified: Boolean(row.is_verified)
    }));
  }

  async listing(id: string): Promise<ListingRecord> {
    const { data, error } = await this.client.from("listings").select("*,listing_photos(*)").eq("id", id).single();
    const listing = mapListing(requireData(data as Record<string, unknown> | null, error, "Listing could not be loaded."));
    return (await this.withSignedPhotos([listing]))[0]!;
  }

  async sellerListings(): Promise<ListingRecord[]> {
    const { data: auth } = await this.client.auth.getUser();
    if (!auth.user) throw backendError(new Error("Authentication required."), "Authentication required.");
    const { data, error } = await this.client.from("listings").select("*,listing_photos(*)").eq("seller_id", auth.user.id).order("created_at", { ascending: false });
    if (error) throw backendError(error, "Seller listings could not be loaded.");
    return await this.withSignedPhotos((data ?? []).map((row) => mapListing(row as Record<string, unknown>)));
  }

  async createDraft(input: Omit<ListingRecord, "id" | "sellerId" | "status" | "createdAt" | "photos" | "publishedAt">): Promise<ListingRecord> {
    const { data: auth } = await this.client.auth.getUser();
    if (!auth.user) throw backendError(new Error("Authentication required."), "Authentication required.");
    const { data, error } = await this.client.from("listings").insert({
      seller_id: auth.user.id, category: input.category, title: input.title.trim(),
      description: input.description.trim(), brand_name: input.brandName.trim(), model: input.model?.trim() || null,
      condition_grade: input.conditionGrade, price_minor: input.priceMinor, currency: input.currency,
      country_code: input.countryCode.toUpperCase(), locality: input.locality.trim(), metadata: input.metadata,
      status: "draft"
    }).select("*").single();
    return mapListing(requireData(data as Record<string, unknown> | null, error, "Listing draft could not be created."));
  }

  async updateDraft(id: string, patch: Partial<ListingRecord>): Promise<ListingRecord> {
    const payload: Record<string, unknown> = {};
    if (patch.category !== undefined) payload.category = patch.category;
    if (patch.title !== undefined) payload.title = patch.title.trim();
    if (patch.description !== undefined) payload.description = patch.description.trim();
    if (patch.brandName !== undefined) payload.brand_name = patch.brandName.trim();
    if (patch.model !== undefined) payload.model = patch.model?.trim() || null;
    if (patch.conditionGrade !== undefined) payload.condition_grade = patch.conditionGrade;
    if (patch.priceMinor !== undefined) payload.price_minor = patch.priceMinor;
    if (patch.currency !== undefined) payload.currency = patch.currency;
    if (patch.countryCode !== undefined) payload.country_code = patch.countryCode.toUpperCase();
    if (patch.locality !== undefined) payload.locality = patch.locality.trim();
    if (patch.metadata !== undefined) payload.metadata = patch.metadata;
    const { data, error } = await this.client.from("listings").update(payload).eq("id", id).select("*").single();
    return mapListing(requireData(data as Record<string, unknown> | null, error, "Listing draft could not be updated."));
  }

  async uploadPhoto(listingId: string, asset: UploadAsset, requiredAngle: string, position: number): Promise<{ path: string }> {
    return await this.uploads.upload("listing_photo", listingId, asset, { requiredAngle, position });
  }

  async removePhoto(photoId: string): Promise<void> {
    await this.edge.invoke("delete-upload-asset", { kind: "listing_photo", assetId: photoId });
  }

  async setShippingRate(listingId: string, input: { countryCode: string; serviceName: string; amountMinor: number; minDays: number; maxDays: number; tracked: boolean; insuredUpToMinor: number }): Promise<void> {
    const { error } = await this.client.from("listing_shipping_rates").upsert({
      listing_id: listingId, country_code: input.countryCode.toUpperCase(), service_name: input.serviceName.trim(),
      amount_minor: input.amountMinor, min_days: input.minDays, max_days: input.maxDays,
      tracked: input.tracked, insured_up_to_minor: input.insuredUpToMinor
    }, { onConflict: "listing_id,country_code,service_name" });
    if (error) throw backendError(error, "Shipping rate could not be saved.");
  }

  async shippingRates(listingId: string): Promise<ListingShippingRate[]> {
    const { data, error } = await this.client.from("listing_shipping_rates").select("*").eq("listing_id", listingId).order("amount_minor");
    if (error) throw backendError(error, "Shipping options could not be loaded.");
    return (data ?? []).map((row) => ({
      id: String(row.id), listingId: String(row.listing_id), countryCode: String(row.country_code),
      serviceName: String(row.service_name), amountMinor: Number(row.amount_minor),
      minDays: Number(row.min_days), maxDays: Number(row.max_days), tracked: Boolean(row.tracked),
      insuredUpToMinor: Number(row.insured_up_to_minor)
    }));
  }

  async publish(id: string): Promise<ListingRecord> {
    const { data, error } = await this.client.rpc("publish_listing", { target_listing_id: id });
    return mapListing(requireData(data as Record<string, unknown> | null, error, "Listing could not be published."));
  }

  async archiveListing(id: string): Promise<ListingRecord> {
    const { data, error } = await this.client.rpc("archive_listing", { target_listing_id: id });
    return mapListing(requireData(data as Record<string, unknown> | null, error, "Listing could not be archived."));
  }

  async deleteDraft(id: string): Promise<void> {
    await this.edge.invoke("delete-listing-draft", { listingId: id });
  }

  async setSaved(listingId: string, saved: boolean): Promise<void> {
    const { data: auth } = await this.client.auth.getUser();
    if (!auth.user) throw backendError(new Error("Authentication required."), "Authentication required.");
    const query = saved
      ? this.client.from("saved_listings").upsert({ user_id: auth.user.id, listing_id: listingId })
      : this.client.from("saved_listings").delete().eq("user_id", auth.user.id).eq("listing_id", listingId);
    const { error } = await query;
    if (error) throw backendError(error, "Saved items could not be updated.");
  }

  async savedListings(): Promise<ListingRecord[]> {
    const { data, error } = await this.client.from("saved_listings").select("listings(*,listing_photos(*))").order("created_at", { ascending: false });
    if (error) throw backendError(error, "Saved items could not be loaded.");
    const listings = (data ?? []).flatMap((row) => row.listings ? [mapListing(row.listings as unknown as Record<string, unknown>)] : []);
    return await this.withSignedPhotos(listings);
  }

  async startConversation(listingId: string): Promise<string> {
    const { data, error } = await this.client.rpc("create_marketplace_conversation", { target_listing_id: listingId });
    return String(requireData(data, error, "Conversation could not be opened."));
  }

  async conversations(): Promise<MarketplaceConversation[]> {
    const { data: auth } = await this.client.auth.getUser();
    if (!auth.user) return [];
    const { data, error } = await this.client.from("marketplace_conversations").select("*")
      .or(`and(buyer_id.eq.${auth.user.id},buyer_archived_at.is.null),and(seller_id.eq.${auth.user.id},seller_archived_at.is.null)`)
      .order("last_message_at", { ascending: false });
    if (error) throw backendError(error, "Conversations could not be loaded.");
    return (data ?? []).map((row) => mapConversation(row as Record<string, unknown>));
  }

  async threads(): Promise<MarketplaceThread[]> {
    const { data: auth } = await this.client.auth.getUser();
    if (!auth.user) return [];
    const conversations = await this.conversations();
    if (!conversations.length) return [];
    const conversationIds = conversations.map((conversation) => conversation.id);
    const listingIds = [...new Set(conversations.map((conversation) => conversation.listingId))];
    const participantIds = [...new Set(conversations.map((conversation) => conversation.buyerId === auth.user!.id ? conversation.sellerId : conversation.buyerId))];
    const [{ data: listingRows, error: listingError }, { data: profiles, error: profileError }, { data: messages, error: messageError }] = await Promise.all([
      this.client.from("listings").select("*,listing_photos(*)").in("id", listingIds),
      this.client.from("profiles").select("id,display_name,avatar_path").in("id", participantIds),
      this.client.from("marketplace_messages").select("*").in("conversation_id", conversationIds).is("deleted_at", null).order("created_at", { ascending: false })
    ]);
    if (listingError) throw backendError(listingError, "Conversation listings could not be loaded.");
    if (profileError) throw backendError(profileError, "Conversation participants could not be loaded.");
    if (messageError) throw backendError(messageError, "Conversation messages could not be loaded.");
    const listings = await this.withSignedPhotos((listingRows ?? []).map((row) => mapListing(row as Record<string, unknown>)));
    const avatarPaths = (profiles ?? []).flatMap((profile) => profile.avatar_path ? [String(profile.avatar_path)] : []);
    const { data: signedAvatars, error: avatarError } = avatarPaths.length
      ? await this.client.storage.from("avatars").createSignedUrls(avatarPaths, 900)
      : { data: [], error: null };
    if (avatarError) throw backendError(avatarError, "Conversation avatars could not be loaded.");
    const avatarUrls = new Map<string, string>((signedAvatars ?? []).flatMap((entry) =>
      entry.path && entry.signedUrl ? [[entry.path, entry.signedUrl]] : []
    ));

    return conversations.map((conversation) => {
      const listing = listings.find((entry) => entry.id === conversation.listingId);
      const participantId = conversation.buyerId === auth.user!.id ? conversation.sellerId : conversation.buyerId;
      const profile = (profiles ?? []).find((entry) => entry.id === participantId);
      const threadMessages = (messages ?? []).filter((entry) => entry.conversation_id === conversation.id);
      const avatarPath = profile?.avatar_path ? String(profile.avatar_path) : undefined;
      return {
        conversation,
        listing: { id: conversation.listingId, title: listing?.title ?? "Listing", photoUrl: listing?.photos?.[0]?.signedUrl },
        participant: {
          id: participantId, displayName: profile?.display_name ? String(profile.display_name) : "Rider",
          avatarUrl: avatarPath ? avatarUrls.get(avatarPath) : undefined
        },
        lastMessage: threadMessages[0] ? mapMessage(threadMessages[0] as Record<string, unknown>) : undefined,
        unreadCount: threadMessages.filter((entry) => entry.sender_id !== auth.user!.id && !entry.read_at).length
      };
    });
  }

  async messages(conversationId: string, before?: string): Promise<MarketplaceMessage[]> {
    let query = this.client.from("marketplace_messages").select("*").eq("conversation_id", conversationId).is("deleted_at", null).order("created_at", { ascending: false }).limit(50);
    if (before) query = query.lt("created_at", before);
    const { data, error } = await query;
    if (error) throw backendError(error, "Messages could not be loaded.");
    return (data ?? []).reverse().map((row) => mapMessage(row as Record<string, unknown>));
  }

  async sendMessage(conversationId: string, body: string, clientNonce = Crypto.randomUUID()): Promise<MarketplaceMessage> {
    const { data: auth } = await this.client.auth.getUser();
    if (!auth.user) throw backendError(new Error("Authentication required."), "Authentication required.");
    const { data, error } = await this.client.from("marketplace_messages").insert({
      conversation_id: conversationId, sender_id: auth.user.id, client_nonce: clientNonce, body: body.trim()
    }).select("*").single();
    if (error?.code === "23505") {
      const { data: existing, error: existingError } = await this.client.from("marketplace_messages")
        .select("*").eq("sender_id", auth.user.id).eq("client_nonce", clientNonce).single();
      return mapMessage(requireData(existing as Record<string, unknown> | null, existingError, "Message retry could not be recovered."));
    }
    return mapMessage(requireData(data as Record<string, unknown> | null, error, "Message could not be sent."));
  }

  async markConversationRead(conversationId: string): Promise<void> {
    const { data: auth } = await this.client.auth.getUser();
    if (!auth.user) return;
    const now = new Date().toISOString();
    const { error } = await this.client.from("marketplace_messages").update({ delivery_status: "read", read_at: now }).eq("conversation_id", conversationId).neq("sender_id", auth.user.id).is("read_at", null);
    if (error) throw backendError(error, "Messages could not be marked as read.");
  }

  async archiveConversation(conversationId: string): Promise<void> {
    const { data: auth } = await this.client.auth.getUser();
    if (!auth.user) return;
    const { data: conversation, error: readError } = await this.client.from("marketplace_conversations")
      .select("buyer_id,seller_id").eq("id", conversationId).single();
    if (readError || !conversation) throw backendError(readError, "Conversation could not be archived.");
    const patch = conversation.buyer_id === auth.user.id
      ? { buyer_archived_at: new Date().toISOString() }
      : { seller_archived_at: new Date().toISOString() };
    const { error } = await this.client.from("marketplace_conversations").update(patch).eq("id", conversationId);
    if (error) throw backendError(error, "Conversation could not be archived.");
  }

  async deleteMessage(messageId: string): Promise<void> {
    const { error } = await this.client.from("marketplace_messages").update({ deleted_at: new Date().toISOString() }).eq("id", messageId);
    if (error) throw backendError(error, "Message could not be deleted.");
  }

  async report(input: { listingId?: string; messageId?: string; userId?: string; reason: MarketplaceReportReason; detail?: string }): Promise<void> {
    const { data: auth } = await this.client.auth.getUser();
    if (!auth.user) throw backendError(new Error("Authentication required."), "Authentication required.");
    const { error } = await this.client.from("marketplace_reports").insert({
      reporter_id: auth.user.id, listing_id: input.listingId ?? null, message_id: input.messageId ?? null,
      reported_user_id: input.userId ?? null, reason: input.reason, detail: input.detail?.trim() || null
    });
    if (error) throw backendError(error, "Report could not be submitted.");
  }

  subscribeToConversation(conversationId: string, onMessage: (message: MarketplaceMessage) => void): () => void {
    const channel: RealtimeChannel = this.client.channel(`marketplace:${conversationId}`).on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "marketplace_messages", filter: `conversation_id=eq.${conversationId}` },
      (payload) => onMessage(mapMessage(payload.new as Record<string, unknown>))
    ).subscribe();
    return () => { void this.client.removeChannel(channel); };
  }

  async beginSellerOnboarding(sellerType: "private" | "business", countryCode: string): Promise<{ url: string; expiresAt: string }> {
    return await this.edge.invoke("seller-onboarding", { sellerType, countryCode });
  }

  async sellerAccount(): Promise<SellerAccount | null> {
    const { data: auth } = await this.client.auth.getUser();
    if (!auth.user) return null;
    const { data, error } = await this.client.from("seller_accounts").select("*").eq("user_id", auth.user.id).maybeSingle();
    if (error) throw backendError(error, "Seller account could not be loaded.");
    return data ? mapSeller(data as Record<string, unknown>) : null;
  }

  async sellerPublicProfile(userId: string): Promise<SellerPublicProfile | null> {
    const { data, error } = await this.client.rpc("get_seller_public_profile", { target_user_id: userId });
    if (error) throw backendError(error, "Seller profile could not be loaded.");
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    const avatarPath = row.avatar_path ? String(row.avatar_path) : undefined;
    const { data: sessionData } = await this.client.auth.getSession();
    const avatarUrl = avatarPath && sessionData.session ? await this.uploads.signedUrl("avatars", avatarPath) : undefined;
    return {
      userId: String(row.user_id), displayName: String(row.display_name), avatarPath, avatarUrl,
      countryCode: String(row.country_code), verificationStatus: row.verification_status as SellerPublicProfile["verificationStatus"],
      memberSince: String(row.member_since),
      ratingAverage: row.rating_average == null ? undefined : Number(row.rating_average),
      reviewCount: Number(row.review_count), completedSales: Number(row.completed_sales)
    };
  }

  async quote(listingId: string, destinationCountry: string, shippingRateId?: string): Promise<CheckoutQuote> {
    const response = await this.edge.invoke<{ quote: Record<string, unknown>; shipping: { service: string; minDays: number; maxDays: number; tracked: boolean } }>("quote-checkout", { listingId, destinationCountry, shippingRateId });
    const row = response.quote;
    return {
      id: String(row.id), listingId: String(row.listing_id), itemAmountMinor: Number(row.item_amount_minor),
      shippingAmountMinor: Number(row.shipping_amount_minor), taxAmountMinor: Number(row.tax_amount_minor),
      protectionFeeMinor: Number(row.protection_fee_minor), totalAmountMinor: Number(row.total_amount_minor),
      currency: String(row.currency), expiresAt: String(row.expires_at), taxBasis: String(row.tax_basis),
      shipping: response.shipping
    };
  }

  async createCheckout(input: { quoteId: string; idempotencyKey: string; shippingAddress: Record<string, string | undefined>; acceptedMarketplaceTerms: true }): Promise<{ orderId: string; clientSecret: string; status: string }> {
    return await this.edge.invoke("create-checkout", input);
  }

  async cancelCheckout(orderId: string): Promise<{ orderId: string; status: string }> {
    return await this.edge.invoke("cancel-checkout", { orderId });
  }

  async orders(): Promise<MarketplaceOrder[]> {
    const { data, error } = await this.client.from("orders").select("*").order("created_at", { ascending: false });
    if (error) throw backendError(error, "Orders could not be loaded.");
    return (data ?? []).map((row) => mapOrder(row as Record<string, unknown>));
  }

  async order(id: string): Promise<MarketplaceOrder> {
    const { data, error } = await this.client.from("orders").select("*").eq("id", id).single();
    return mapOrder(requireData(data as Record<string, unknown> | null, error, "Order could not be loaded."));
  }

  async orderEvents(orderId: string): Promise<OrderEvent[]> {
    const { data, error } = await this.client.from("order_events").select("*").eq("order_id", orderId).order("created_at");
    if (error) throw backendError(error, "Order history could not be loaded.");
    return (data ?? []).map((row) => ({
      id: Number(row.id), orderId: String(row.order_id), fromStatus: row.from_status ? String(row.from_status) : undefined,
      toStatus: String(row.to_status), detail: (row.detail ?? {}) as Record<string, unknown>, createdAt: String(row.created_at)
    }));
  }

  async shipment(orderId: string): Promise<ShipmentRecord | null> {
    const { data, error } = await this.client.from("shipments").select("*").eq("order_id", orderId).maybeSingle();
    if (error) throw backendError(error, "Shipment could not be loaded.");
    return data ? {
      id: String(data.id), orderId: String(data.order_id), carrier: String(data.carrier),
      service: data.service ? String(data.service) : undefined,
      trackingNumber: String(data.tracking_number), trackingUrl: data.tracking_url ? String(data.tracking_url) : undefined,
      insuredAmountMinor: Number(data.insured_amount_minor),
      deliveredAt: data.delivered_at ? String(data.delivered_at) : undefined, createdAt: String(data.created_at)
    } : null;
  }

  async dispute(orderId: string): Promise<MarketplaceDispute | null> {
    const { data, error } = await this.client.from("order_disputes").select("*").eq("order_id", orderId).maybeSingle();
    if (error) throw backendError(error, "Dispute could not be loaded.");
    return data ? {
      id: String(data.id), orderId: String(data.order_id), openedBy: String(data.opened_by),
      reason: String(data.reason), detail: String(data.detail), status: String(data.status),
      resolution: data.resolution ? String(data.resolution) : undefined,
      refundAmountMinor: data.refund_amount_minor == null ? undefined : Number(data.refund_amount_minor),
      createdAt: String(data.created_at)
    } : null;
  }

  async markShipped(orderId: string, carrier: string, trackingNumber: string, trackingUrl?: string): Promise<MarketplaceOrder> {
    const { data, error } = await this.client.rpc("mark_order_shipped", { target_order_id: orderId, carrier_name: carrier, tracking_code: trackingNumber, tracking_link: trackingUrl ?? null });
    return mapOrder(requireData(data as Record<string, unknown> | null, error, "Shipment could not be saved."));
  }

  async confirmDelivery(orderId: string): Promise<MarketplaceOrder> {
    const { data, error } = await this.client.rpc("start_order_inspection", { target_order_id: orderId });
    return mapOrder(requireData(data as Record<string, unknown> | null, error, "Delivery could not be confirmed."));
  }

  async openDispute(orderId: string, reason: string, detail: string): Promise<{ id: string }> {
    const { data, error } = await this.client.rpc("create_order_dispute", { target_order_id: orderId, dispute_reason: reason, dispute_detail: detail });
    const row = requireData(data as Record<string, unknown> | null, error, "Dispute could not be opened.");
    return { id: String(row.id) };
  }

  async attachDisputeEvidence(disputeId: string, asset: UploadAsset, note?: string): Promise<{ path: string }> {
    return await this.uploads.upload("dispute_evidence", disputeId, asset, { note });
  }

  async removeDisputeEvidence(evidenceId: string): Promise<void> {
    await this.edge.invoke("delete-upload-asset", { kind: "dispute_evidence", assetId: evidenceId });
  }

  async disputeEvidence(disputeId: string): Promise<DisputeEvidenceRecord[]> {
    const { data, error } = await this.client.from("dispute_evidence").select("*").eq("dispute_id", disputeId).order("created_at");
    if (error) throw backendError(error, "Dispute evidence could not be loaded.");
    return await Promise.all((data ?? []).map(async (row) => ({
      id: String(row.id), disputeId: String(row.dispute_id), uploadedBy: String(row.uploaded_by),
      objectPath: String(row.object_path), mimeType: String(row.mime_type), byteSize: Number(row.byte_size),
      note: row.note ? String(row.note) : undefined,
      signedUrl: await this.uploads.signedUrl("dispute-evidence", String(row.object_path)),
      createdAt: String(row.created_at)
    })));
  }

  async acceptOrder(orderId: string): Promise<{ orderId: string; status: string }> {
    return await this.edge.invoke("release-order", { orderId });
  }

  async reviewOrder(orderId: string, revieweeId: string, rating: number, body?: string): Promise<MarketplaceReview> {
    const { data: auth } = await this.client.auth.getUser();
    if (!auth.user) throw backendError(new Error("Authentication required."), "Authentication required.");
    const { data, error } = await this.client.from("marketplace_reviews").insert({
      order_id: orderId, reviewer_id: auth.user.id, reviewee_id: revieweeId,
      rating, body: body?.trim() || null
    }).select("*").single();
    return mapReview(requireData(data as Record<string, unknown> | null, error, "Review could not be submitted."));
  }

  async reviewsForUser(userId: string, limit = 30): Promise<MarketplaceReview[]> {
    const { data, error } = await this.client.from("marketplace_reviews").select("*").eq("reviewee_id", userId)
      .order("created_at", { ascending: false }).limit(Math.min(50, limit));
    if (error) throw backendError(error, "Seller reviews could not be loaded.");
    return (data ?? []).map((row) => mapReview(row as Record<string, unknown>));
  }

  subscribeToOrders(onChange: () => void): () => void {
    const channel: RealtimeChannel = this.client.channel("marketplace:orders").on(
      "postgres_changes", { event: "*", schema: "public", table: "orders" }, onChange
    ).subscribe();
    return () => { void this.client.removeChannel(channel); };
  }
}
