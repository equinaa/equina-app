export const equinaVisualViewports = [
  { id: "iphone-se", width: 375, height: 667 },
  { id: "iphone-15-pro", width: 393, height: 852 },
  { id: "iphone-16-pro-max", width: 430, height: 932 }
] as const;

export const equinaVisualScenarios = [
  { id: "onboarding-you", entry: "fresh", testID: "onboarding-next-you" },
  { id: "home-demo", entry: "demo-profile", testID: "ride-toggle" },
  { id: "shop-read-only", entry: "demo-profile/shop", testID: "shop-search" }
] as const;

