export type ExperienceState = "loading" | "empty" | "error" | "offline" | "permission";

export type ExperienceStateDefinition = {
  title: string;
  body: string;
  actionLabel?: string;
};

export const experienceStateDefaults: Record<ExperienceState, ExperienceStateDefinition> = {
  loading: {
    title: "Getting this ready",
    body: "Your place on this screen will not move while Equina loads."
  },
  empty: {
    title: "Nothing here yet",
    body: "Your first saved item will appear here."
  },
  error: {
    title: "That did not work",
    body: "Your changes were not saved. Try again when you are ready.",
    actionLabel: "Try again"
  },
  offline: {
    title: "You are offline",
    body: "Saved information stays visible. New changes will wait for a connection.",
    actionLabel: "Try again"
  },
  permission: {
    title: "Permission needed",
    body: "Equina only requests access when you choose an action that needs it.",
    actionLabel: "Review access"
  }
};

