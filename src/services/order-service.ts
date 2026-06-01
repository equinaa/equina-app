import type { Dispute, Order, Review } from "../domain/types";
import { createId } from "./id";
import type { EquinaStore } from "./store";

export class OrderService {
  constructor(private readonly store: EquinaStore) {}

  createOrder(listingId: string, buyerId: string): Order {
    const listing = this.store.listings.find((candidate) => candidate.id === listingId);
    if (!listing || listing.status !== "active") throw new Error("Listing is not available");

    const order: Order = {
      id: createId("ord"),
      listingId,
      buyerId,
      sellerId: listing.sellerId,
      amount: listing.priceAmount,
      currency: listing.currency,
      status: "paid",
      providerPaymentId: createId("pay")
    };

    listing.status = "sold";
    this.store.orders.push(order);
    return order;
  }

  startInspection(orderId: string): Order {
    const order = this.getOrder(orderId);
    if (order.status !== "paid" && order.status !== "shipped") {
      throw new Error("Inspection can only start after payment or shipment.");
    }
    order.status = "inspection";
    order.inspectionEndsAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 5).toISOString();
    return order;
  }

  acceptOrder(orderId: string): Order {
    const order = this.getOrder(orderId);
    if (order.status !== "inspection") {
      throw new Error("Orders can only be accepted during inspection.");
    }
    order.status = "released";
    return order;
  }

  openDispute(orderId: string, openedBy: string, reason: Dispute["reason"], evidenceUrls: string[]): Dispute {
    const order = this.getOrder(orderId);
    if (order.status !== "inspection") {
      throw new Error("Disputes require an active inspection window.");
    }
    if (order.inspectionEndsAt && Date.now() > new Date(order.inspectionEndsAt).getTime()) {
      throw new Error("Inspection window has expired.");
    }
    if (evidenceUrls.length < 2) {
      throw new Error("Disputes require at least two evidence photos.");
    }

    order.status = "disputed";
    const dispute: Dispute = {
      id: createId("dsp"),
      orderId,
      openedBy,
      reason,
      status: "open",
      evidenceUrls
    };
    this.store.disputes.push(dispute);
    return dispute;
  }

  createReview(orderId: string, reviewerId: string, revieweeId: string, rating: Review["rating"], body?: string): Review {
    const order = this.getOrder(orderId);
    if (order.status !== "released") throw new Error("Reviews require a completed order.");

    const review: Review = {
      id: createId("rev"),
      orderId,
      reviewerId,
      revieweeId,
      rating,
      body,
      verified: true
    };
    this.store.reviews.push(review);
    return review;
  }

  private getOrder(orderId: string): Order {
    const order = this.store.orders.find((candidate) => candidate.id === orderId);
    if (!order) throw new Error("Order not found");
    return order;
  }
}
