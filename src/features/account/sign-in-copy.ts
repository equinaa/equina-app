/**
 * Every word on the sign-in screen. Kept apart from the component so the
 * copy can be reviewed, and tested, without rendering anything.
 */
export const signInCopy = {
  wordmark: "Equina",
  headline: "Keep your horses, rides, and plan in one account.",
  subhead: "New here? Set up your Equina in three short steps.",
  // Apple's button draws its own title. Nothing here labels it.
  google: "Continue with Google",
  email: "Sign in with email",
  divider: "or",
  // Someone arriving from the App Store is far more likely new than returning,
  // so creating is the primary action and signing in the quiet one.
  createAccount: "Create my Equina",
  createAccountA11y: "Create an account",
  status: {
    finishing: "Finishing sign-in..."
  },
  // The same answer whether or not an account uses the email, so these
  // screens can never be used to test which emails are registered.
  notices: {
    recoverySent: "If an Equina account uses this email, we sent a reset link to it. Open the link on this device.",
    signInLinkSent: "If an Equina account uses this email, we sent a sign-in link to it. Open the link on this device.",
    // Only for a sign-out the rider did not ask for.
    expired: "You were signed out. Sign in again to continue.",
    linkFailed: "That link did not work. A link works once, and only on the device that asked for it. Request a new one."
  },
  errors: {
    badCredentials: "That email or password is incorrect, or the email is not confirmed yet.",
    unreachable: "Equina could not reach the sign-in service. Check your connection and try again.",
    tooManyAttempts: "Too many attempts. Wait a minute and try again.",
    appleFailed: "Apple sign-in could not be completed. Try again, or use email.",
    googleFailed: "Google sign-in could not be completed. Try again, or use email.",
    popupBlocked: "Your browser blocked the sign-in window. Allow pop-ups for this site and try again.",
    generic: "Something went wrong. Try again."
    // Cancelling inside Apple or Google is a change of mind, not an error.
  },
  unavailable: {
    title: "Sign-in is not available in this build.",
    body: "This build has no backend configured, so no sign-in method can work.",
    demo: "Explore with demo data"
  },
  exits: {
    gateError: "Sign in with a different account",
    // Voice Control finds a control by its visible words, so the label
    // repeats them and the hint carries the explanation.
    onboarding: "Switch account",
    onboardingHint: "Not you? Signs out so you can use a different account."
  }
} as const;
