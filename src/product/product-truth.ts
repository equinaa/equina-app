import type { Listing } from "../domain/types";

export type HorseFitContext = {
  hasProfile?: boolean;
  name: string;
  heightCm?: number;
  backLengthCm?: number;
  shoulderAngle?: "upright" | "average" | "sloped";
};

export type FitScreening = {
  title: string;
  shortLabel: string;
  detail: string;
  confidenceLabel: "Preliminary" | "More data needed" | "Sizing check";
};

export function getFitScreening(listing?: Listing, horse?: HorseFitContext): FitScreening {
  if (!listing) {
    return {
      title: "More details needed",
      shortLabel: "Details needed",
      detail: "Open an item to review its measurements and condition evidence.",
      confidenceLabel: "More data needed"
    };
  }

  if (listing.category !== "saddle") {
    return {
      title: "Check item sizing",
      shortLabel: "Check sizing",
      detail: "Review the seller's measurements and confirm the size before buying.",
      confidenceLabel: "Sizing check"
    };
  }

  if (!horse || horse.hasProfile === false) {
    const hasListingMeasurements = Boolean(listing.metadata?.treeSize && listing.metadata?.seatSize);
    return {
      title: hasListingMeasurements ? "Measurements listed" : "Seller details needed",
      shortLabel: hasListingMeasurements ? "Measurements listed" : "Ask for details",
      detail: hasListingMeasurements
        ? "Open the fit screen with a horse profile to review what is available and what is still missing."
        : "Ask the seller for tree and seat measurements before screening this saddle.",
      confidenceLabel: "More data needed"
    };
  }

  const hasHorseMeasurements = Boolean(horse?.heightCm && horse.backLengthCm && horse.shoulderAngle);
  const hasSaddleMeasurements = Boolean(listing.metadata?.treeSize && listing.metadata?.seatSize);

  if (hasHorseMeasurements && hasSaddleMeasurements) {
    return {
      title: "Worth inspecting",
      shortLabel: "Measurements ready",
      detail: "Horse and saddle measurements are available for a preliminary review. A qualified saddler must confirm the fit.",
      confidenceLabel: "Preliminary"
    };
  }

  if (!hasHorseMeasurements && !hasSaddleMeasurements) {
    return {
      title: "Measurements needed",
      shortLabel: "Details needed",
      detail: "Add horse measurements and ask the seller for tree and seat details before assessing this saddle.",
      confidenceLabel: "More data needed"
    };
  }

  return {
    title: "More details needed",
    shortLabel: hasHorseMeasurements ? "Ask seller" : "Add horse data",
    detail: hasHorseMeasurements
      ? "Your horse profile is ready, but the seller must provide the missing saddle measurements."
      : "The saddle has useful metadata, but your horse profile needs height, back length, and shoulder shape.",
    confidenceLabel: "More data needed"
  };
}
