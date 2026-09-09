import { createEquinaApi } from "../api/equina-api";

const horseHero = "https://images.pexels.com/photos/1996333/pexels-photo-1996333.jpeg?auto=compress&cs=tinysrgb&w=1200";
const tackDetail = "https://images.pexels.com/photos/5087997/pexels-photo-5087997.jpeg?auto=compress&cs=tinysrgb&w=1200";
const saddleOnHorse = "https://images.pexels.com/photos/7882504/pexels-photo-7882504.jpeg?auto=compress&cs=tinysrgb&w=1200";
const saddleDetail = "https://images.pexels.com/photos/7883342/pexels-photo-7883342.jpeg?auto=compress&cs=tinysrgb&w=1200";
const saddleFence = "https://images.pexels.com/photos/7883480/pexels-photo-7883480.jpeg?auto=compress&cs=tinysrgb&w=1200";
const bridleDetail = "https://images.pexels.com/photos/8665354/pexels-photo-8665354.jpeg?auto=compress&cs=tinysrgb&w=1200";
const bridlePortrait = "https://images.pexels.com/photos/30010796/pexels-photo-30010796.jpeg?auto=compress&cs=tinysrgb&w=1200";
const whiteBridle = "https://images.pexels.com/photos/27669462/pexels-photo-27669462.jpeg?auto=compress&cs=tinysrgb&w=1200";
const showBridle = "https://images.pexels.com/photos/27110989/pexels-photo-27110989.jpeg?auto=compress&cs=tinysrgb&w=1200";
const darkBridle = "https://images.pexels.com/photos/35105157/pexels-photo-35105157.jpeg?auto=compress&cs=tinysrgb&w=1200";
const ridingDetail = "https://images.pexels.com/photos/162240/horse-brown-horse-stable-animal-162240.jpeg?auto=compress&cs=tinysrgb&w=1200";
const stableDetail = "https://images.pexels.com/photos/7883418/pexels-photo-7883418.jpeg?auto=compress&cs=tinysrgb&w=1200";

export const createSeededEquinaApi = () => {
  const api = createEquinaApi();

  const buyerSession = api.auth.signIn({ email: "ilinca.rider@example.com", locale: "en" });
  const sellerSession = api.auth.signIn({ email: "marina.gear@example.com", locale: "en" });
  const coachSession = api.auth.signIn({ email: "coach.matei@example.com", locale: "en" });

  api.store.users.find((user) => user.id === sellerSession.userId)?.roles.push("seller", "verified_seller");
  api.store.users.find((user) => user.id === coachSession.userId)?.roles.push("coach", "verified_coach");

  api.store.sellerVerifications.push({
    userId: sellerSession.userId,
    status: "verified",
    idVerifiedAt: new Date().toISOString(),
    payoutVerifiedAt: new Date().toISOString(),
    riskLevel: "low"
  });

  api.profiles.upsertProfile({
    userId: buyerSession.userId,
    displayName: "Ilinca",
    location: "Barcelona, Spain",
    discipline: "dressage",
    skillLevel: "intermediate"
  });

  api.profiles.upsertProfile({
    userId: sellerSession.userId,
    displayName: "Marina Hart",
    location: "Lexington, USA",
    discipline: "jumping",
    skillLevel: "advanced",
    bio: "Verified launch seller with premium tack from active sport horses."
  });

  const horse = api.profiles.createHorse({
    ownerId: buyerSession.userId,
    name: "Ralfy",
    breed: "Warmblood",
    heightCm: 166,
    discipline: "dressage",
    ageYears: 9,
    measurements: {
      witherHeightCm: 166,
      backLengthCm: 61,
      shoulderAngle: "average"
    }
  });

  const saddle = api.listings.createListing({
    sellerId: sellerSession.userId,
    category: "saddle",
    title: "CWD jumping saddle 17.5 with verified serial",
    brand: "CWD",
    model: "SE02",
    conditionGrade: "good",
    priceAmount: 1850,
    currency: "EUR",
    location: "Lexington, USA",
    photos: [
      { url: tackDetail, requiredAngle: "left_side" },
      { url: saddleDetail, requiredAngle: "right_side" },
      { url: tackDetail, requiredAngle: "tree_headplate" },
      { url: saddleOnHorse, requiredAngle: "panels" },
      { url: saddleDetail, requiredAngle: "billets" },
      { url: tackDetail, requiredAngle: "seat" },
      { url: tackDetail, requiredAngle: "serial_number" }
    ],
    metadata: {
      saddleType: "jumping",
      treeSize: "medium",
      flapSize: "3C",
      seatSize: "17.5",
      serialNumber: "CWD-SE02-GL-18422",
      proofOfOwnership: true
    }
  });

  api.listings.updateListing(saddle.id, { status: "active" });

  const dressageSaddle = api.listings.createListing({
    sellerId: sellerSession.userId,
    category: "saddle",
    title: "Prestige X-D2 dressage saddle 17 medium tree",
    brand: "Prestige",
    model: "X-D2",
    conditionGrade: "like_new",
    priceAmount: 920,
    currency: "EUR",
    location: "Aachen, Germany",
    photos: [
      { url: saddleOnHorse, requiredAngle: "left_side" },
      { url: saddleDetail, requiredAngle: "right_side" },
      { url: tackDetail, requiredAngle: "tree_headplate" },
      { url: stableDetail, requiredAngle: "panels" },
      { url: saddleOnHorse, requiredAngle: "billets" },
      { url: saddleDetail, requiredAngle: "seat" },
      { url: tackDetail, requiredAngle: "serial_number" }
    ],
    metadata: {
      saddleType: "dressage",
      treeSize: "medium",
      flapSize: "standard",
      seatSize: "17",
      serialNumber: "PRS-ROMA-GL-7710",
      proofOfOwnership: true
    }
  });

  const bridle = api.listings.createListing({
    sellerId: sellerSession.userId,
    category: "bridle",
    title: "Passier double bridle cob/full black leather",
    brand: "Passier",
    model: "Auriga",
    conditionGrade: "good",
    priceAmount: 165,
    currency: "USD",
    location: "Wellington, USA",
    photos: [
      { url: bridleDetail, requiredAngle: "front" },
      { url: tackDetail, requiredAngle: "buckles" },
      { url: bridleDetail, requiredAngle: "bit_attachment" },
      { url: stableDetail, requiredAngle: "wear_closeup" }
    ]
  });

  const devoucouxSaddle = api.listings.createListing({
    sellerId: sellerSession.userId,
    category: "saddle",
    title: "Devoucoux Makila dressage saddle 17.5 medium",
    brand: "Devoucoux",
    model: "Makila",
    conditionGrade: "good",
    priceAmount: 2400,
    currency: "EUR",
    location: "Paris, France",
    photos: [
      { url: saddleFence, requiredAngle: "left_side" },
      { url: saddleDetail, requiredAngle: "right_side" },
      { url: tackDetail, requiredAngle: "tree_headplate" },
      { url: saddleOnHorse, requiredAngle: "panels" },
      { url: saddleFence, requiredAngle: "billets" },
      { url: saddleDetail, requiredAngle: "seat" },
      { url: tackDetail, requiredAngle: "serial_number" }
    ],
    metadata: {
      saddleType: "dressage",
      treeSize: "medium",
      flapSize: "2A",
      seatSize: "17.5",
      serialNumber: "DVX-MAK-22041",
      proofOfOwnership: true
    }
  });
  api.listings.updateListing(devoucouxSaddle.id, { status: "active" });

  api.listings.createListing({
    sellerId: sellerSession.userId,
    category: "saddle",
    title: "Antares Connexion jumping saddle 17 medium tree",
    brand: "Antares",
    model: "Connexion",
    conditionGrade: "like_new",
    priceAmount: 2100,
    currency: "USD",
    location: "Ocala, USA",
    photos: [
      { url: saddleDetail, requiredAngle: "left_side" },
      { url: tackDetail, requiredAngle: "right_side" },
      { url: saddleFence, requiredAngle: "tree_headplate" },
      { url: saddleOnHorse, requiredAngle: "panels" },
      { url: saddleDetail, requiredAngle: "billets" },
      { url: tackDetail, requiredAngle: "seat" },
      { url: saddleFence, requiredAngle: "serial_number" }
    ],
    metadata: {
      saddleType: "jumping",
      treeSize: "medium",
      flapSize: "3N",
      seatSize: "17",
      serialNumber: "ANT-CON-8820",
      proofOfOwnership: true
    }
  });

  api.listings.createListing({
    sellerId: sellerSession.userId,
    category: "pad",
    title: "Kentucky velvet saddle pad navy full size",
    brand: "Kentucky",
    model: "Velvet",
    conditionGrade: "like_new",
    priceAmount: 145,
    currency: "EUR",
    location: "Amsterdam, Netherlands",
    photos: [
      { url: showBridle, requiredAngle: "top" },
      { url: tackDetail, requiredAngle: "underside" },
      { url: saddleDetail, requiredAngle: "binding" },
      { url: saddleOnHorse, requiredAngle: "wear_closeup" }
    ]
  });

  api.listings.createListing({
    sellerId: sellerSession.userId,
    category: "boot",
    title: "Parlanti Denver tall boots calf leather",
    brand: "Parlanti",
    model: "Denver",
    conditionGrade: "good",
    priceAmount: 420,
    currency: "EUR",
    location: "Milan, Italy",
    photos: [
      { url: darkBridle, requiredAngle: "pair" },
      { url: bridleDetail, requiredAngle: "soles" },
      { url: bridlePortrait, requiredAngle: "zippers_or_closures" },
      { url: whiteBridle, requiredAngle: "wear_closeup" }
    ]
  });

  api.listings.createListing({
    sellerId: sellerSession.userId,
    category: "girth",
    title: "Stubben Equi-Soft anatomical girth 130 cm",
    brand: "Stubben",
    model: "Equi-Soft",
    conditionGrade: "good",
    priceAmount: 180,
    currency: "GBP",
    location: "London, UK",
    photos: [
      { url: bridleDetail, requiredAngle: "front" },
      { url: darkBridle, requiredAngle: "elastic" },
      { url: tackDetail, requiredAngle: "buckles" },
      { url: bridlePortrait, requiredAngle: "wear_closeup" }
    ]
  });

  api.listings.createListing({
    sellerId: sellerSession.userId,
    category: "bit",
    title: "Sprenger KK Ultra loose ring bit 14 mm",
    brand: "Sprenger",
    model: "KK Ultra",
    conditionGrade: "good",
    priceAmount: 95,
    currency: "EUR",
    location: "Hamburg, Germany",
    photos: [
      { url: bridleDetail, requiredAngle: "front" },
      { url: whiteBridle, requiredAngle: "side" },
      { url: darkBridle, requiredAngle: "markings" }
    ]
  });

  api.listings.createListing({
    sellerId: sellerSession.userId,
    category: "blanket",
    title: "Horseware Rambo stable blanket 155 cm",
    brand: "Horseware",
    model: "Rambo",
    conditionGrade: "good",
    priceAmount: 155,
    currency: "USD",
    location: "Toronto, Canada",
    photos: [
      { url: horseHero, requiredAngle: "front" },
      { url: saddleOnHorse, requiredAngle: "inside" },
      { url: saddleFence, requiredAngle: "straps" },
      { url: tackDetail, requiredAngle: "wear_closeup" }
    ]
  });

  api.listings.createListing({
    sellerId: sellerSession.userId,
    category: "stirrup",
    title: "Freejump Soft Up Pro safety stirrups black",
    brand: "Freejump",
    model: "Soft Up Pro",
    conditionGrade: "like_new",
    priceAmount: 210,
    currency: "EUR",
    location: "Stockholm, Sweden",
    photos: [
      { url: saddleDetail, requiredAngle: "pair" },
      { url: bridleDetail, requiredAngle: "treads" },
      { url: darkBridle, requiredAngle: "hinges_or_safety_release" }
    ]
  });

  api.community.createPost({
    authorId: sellerSession.userId,
    space: "jumping",
    postType: "journal",
    title: "Tiny win: softer landings today",
    body: "Kept the line simple and focused on breathing through the last two strides.",
    linkedListingId: saddle.id
  });

  api.community.createPost({
    authorId: coachSession.userId,
    space: "coach_qna",
    postType: "question",
    title: "How do you make canter transitions cleaner?",
    body: "Start with rhythm, keep the outside rein honest, and reward the first soft try."
  });

  const inspectionOrder = api.orders.createOrder(bridle.id, buyerSession.userId);
  api.orders.startInspection(inspectionOrder.id);

  return { api, buyerSession, sellerSession, coachSession, horse, saddle, dressageSaddle, bridle };
};

if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("seed-data.ts")) {
  const { api } = createSeededEquinaApi();
  console.log(JSON.stringify(api.store, null, 2));
}
