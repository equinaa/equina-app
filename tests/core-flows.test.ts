import assert from "node:assert/strict";
import { createEquinaApi } from "../src/api/equina-api";
import { equinaFeatureFlags } from "../src/config/feature-flags";
import { getFitScreening } from "../src/product/product-truth";
import { createSeededEquinaApi } from "../src/seed/seed-data";
import { floatingDockContentInset, floatingDockMetrics } from "../src/ui/layout/metrics";
import { experienceStateDefaults } from "../src/ui/states/experience-states";
import { equinaVisualViewports } from "./visual/fixtures";

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

{
  const { api, buyerSession, bridle } = createSeededEquinaApi();
  const inspectionOrder = api.store.orders.find((order) => order.listingId === bridle.id);
  assert.ok(inspectionOrder);
  assert.equal(inspectionOrder.status, "inspection");
  assert.equal(bridle.status, "sold");

  expectThrows(() => api.orders.createOrder(bridle.id, buyerSession.userId), "not available");
  api.orders.acceptOrder(inspectionOrder.id);
  assert.equal(inspectionOrder.status, "released");
}

{
  const { api, sellerSession } = createSeededEquinaApi();
  const listingCount = api.store.listings.length;
  const listing = api.listings.createListing({
    sellerId: sellerSession.userId,
    category: "pad",
    title: "Kentucky velvet saddle pad navy full size",
    brand: "Kentucky",
    model: "Velvet",
    conditionGrade: "like_new",
    priceAmount: 290,
    currency: "USD",
    location: "Lexington, USA",
    photos: [
      { url: "https://example.com/top.jpg", requiredAngle: "top" },
      { url: "https://example.com/underside.jpg", requiredAngle: "underside" },
      { url: "https://example.com/binding.jpg", requiredAngle: "binding" },
      { url: "https://example.com/wear.jpg", requiredAngle: "wear_closeup" }
    ]
  });
  assert.equal(listing.status, "active");
  assert.equal(api.store.listings.length, listingCount + 1);
}

{
  const { saddle, horse, bridle } = createSeededEquinaApi();
  const saddleScreening = getFitScreening(saddle, {
    name: horse.name,
    heightCm: horse.heightCm,
    backLengthCm: horse.measurements?.backLengthCm,
    shoulderAngle: horse.measurements?.shoulderAngle
  });
  assert.equal(saddleScreening.title, "Worth inspecting");
  assert.equal(/\d+%/.test(`${saddleScreening.title} ${saddleScreening.detail}`), false);
  assert.equal(getFitScreening(bridle).confidenceLabel, "Sizing check");
}

{
  assert.equal(equinaFeatureFlags.clubPublishing, false);
  assert.equal(equinaFeatureFlags.shopTransactions, false);
  assert.equal(equinaFeatureFlags.shopListingCreation, false);
  assert.equal(equinaFeatureFlags.recordMutations, false);
  assert.ok(floatingDockContentInset >= floatingDockMetrics.height + floatingDockMetrics.bottom + 24);
  assert.deepEqual(
    equinaVisualViewports.map(({ width, height }) => `${width}x${height}`),
    ["375x667", "393x852", "430x932"]
  );
  assert.equal(experienceStateDefaults.error.actionLabel, "Try again");
  assert.equal(experienceStateDefaults.offline.title, "You are offline");
}

console.log("Core Equina flows passed.");
