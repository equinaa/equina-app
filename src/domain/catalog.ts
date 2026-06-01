import type { ListingCategory } from "./types";

export const premiumBrands = [
  "Antares",
  "Childeric",
  "CWD",
  "Devoucoux",
  "Passier",
  "Stubben",
  "Prestige",
  "Butet",
  "Amerigo",
  "Albion"
] as const;

export const requiredPhotoAngles: Record<ListingCategory, string[]> = {
  saddle: ["left_side", "right_side", "tree_headplate", "panels", "billets", "seat", "serial_number"],
  bridle: ["front", "buckles", "bit_attachment", "wear_closeup"],
  bit: ["front", "side", "markings"],
  girth: ["front", "elastic", "buckles", "wear_closeup"],
  stirrup: ["pair", "treads", "hinges_or_safety_release"],
  boot: ["pair", "soles", "zippers_or_closures", "wear_closeup"],
  pad: ["top", "underside", "binding", "wear_closeup"],
  blanket: ["front", "inside", "straps", "wear_closeup"],
  helmet: ["front", "certification_label", "inside", "shell_closeup"],
  apparel: ["front", "back", "label", "wear_closeup"],
  grooming: ["front", "wear_closeup"],
  training_aid: ["front", "hardware", "wear_closeup"],
  transport: ["front", "hardware", "wear_closeup"]
};

export const bannedListingReasons = {
  brokenHelmet: "Helmets with known impact history or broken shells cannot be sold.",
  expiredHelmet: "Expired safety helmets are blocked from functional sale.",
  unsafeForParts: "Unsafe equipment must be listed for parts only and cannot imply ride safety."
};
