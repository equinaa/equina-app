/**
 * Every word on the beta door. Equina sends nobody an email when they are
 * invited, so nothing here says it will: the rider checks again themselves.
 */
export const betaAccessCopy = {
  wordmark: "Equina",
  title: "Equina is invite-only for now.",
  body: (email: string) =>
    email
      ? `Your account is saved. As soon as ${email} is invited, you can come straight in.`
      : "Your account is saved. As soon as its email is invited, you can come straight in.",
  checkAgain: "Check again",
  checking: "Checking...",
  stillWaiting: "Not yet: this email is not on the invite list.",
  unreachable: "Equina could not be reached. Check your connection and try again.",
  signOut: "Sign out",
  deleteAccount: "Delete my account",
  deleteHint: "Schedules the deletion of this account and everything saved in it.",
  confirm: {
    title: "Schedule account deletion?",
    body: "You have 14 days to cancel. Personal data is removed when the deletion becomes effective.",
    cancel: "Cancel",
    confirm: "Schedule deletion"
  },
  deletion: {
    title: "Deletion scheduled",
    body: (date: string) => `This account will be deleted on ${date}.`,
    keep: "Keep my account"
  }
} as const;
