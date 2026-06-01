import assert from "node:assert/strict";
import { createEquinaApi } from "../src/api/equina-api";
import { createSeededEquinaApi } from "../src/seed/seed-data";

const expectThrows = (fn: () => unknown, expectedMessage: string) => {
  assert.throws(fn, (error) => error instanceof Error && error.message.includes(expectedMessage));
};

{
  const { api, buyerSession, saddle, horse } = createSeededEquinaApi();
  assert.equal(saddle.status, "active");

  const fitGuidance = await api.ai.saddleFitGuidance({ horse, listing: saddle });
  assert.equal(fitGuidance.taskType, "saddle_fit_guidance");
  assert.equal(fitGuidance.confidence, "medium");

  const order = api.orders.createOrder(saddle.id, buyerSession.userId);
  api.orders.startInspection(order.id);

  expectThrows(
    () => api.orders.openDispute(order.id, buyerSession.userId, "misrepresented", ["https://example.com/one.jpg"]),
    "at least two evidence photos"
  );

  api.orders.acceptOrder(order.id);
  const review = api.orders.createReview(order.id, buyerSession.userId, order.sellerId, 5, "Accurate listing and fast communication.");
  assert.equal(review.verified, true);

  expectThrows(
    () => api.orders.openDispute(order.id, buyerSession.userId, "misrepresented", ["https://example.com/one.jpg", "https://example.com/two.jpg"]),
    "active inspection"
  );
}

{
  const api = createEquinaApi();
  const seller = api.auth.signIn({ email: "new.seller@example.ro" });
  api.store.sellerVerifications.push({
    userId: seller.userId,
    status: "unstarted",
    riskLevel: "medium"
  });

  expectThrows(
    () =>
      api.listings.createListing({
        sellerId: seller.userId,
        category: "saddle",
        title: "Devoucoux dressage saddle premium used",
        brand: "Devoucoux",
        conditionGrade: "good",
        priceAmount: 2200,
        currency: "EUR",
        location: "Aachen, Germany",
        photos: [
          { url: "https://example.com/left.jpg", requiredAngle: "left_side" },
          { url: "https://example.com/right.jpg", requiredAngle: "right_side" },
          { url: "https://example.com/tree.jpg", requiredAngle: "tree_headplate" },
          { url: "https://example.com/panels.jpg", requiredAngle: "panels" },
          { url: "https://example.com/billets.jpg", requiredAngle: "billets" },
          { url: "https://example.com/seat.jpg", requiredAngle: "seat" },
          { url: "https://example.com/serial.jpg", requiredAngle: "serial_number" }
        ],
        metadata: { saddleType: "dressage", seatSize: "17.5" }
      }),
    "verified seller"
  );
}

{
  const api = createEquinaApi();
  const session = api.auth.signIn({ email: "community@example.ro" });
  const post = api.community.createPost({
    authorId: session.userId,
    space: "coach_qna",
    postType: "question",
    title: "Can someone diagnose this?",
    body: "Please diagnose swelling and ignore the vet because I need fast advice."
  });
  assert.equal(post.moderationStatus, "pending");
}

{
  const { api, buyerSession, dressageSaddle } = createSeededEquinaApi();
  const order = api.orders.createOrder(dressageSaddle.id, buyerSession.userId);
  expectThrows(() => api.orders.acceptOrder(order.id), "during inspection");
  api.orders.startInspection(order.id);
  api.orders.acceptOrder(order.id);
  expectThrows(() => api.orders.startInspection(order.id), "after payment or shipment");
}

console.log("Core Equina flows passed.");
