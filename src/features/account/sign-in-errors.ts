import { networkUnreachable } from "../../backend/errors";
import { signInCopy as copy } from "./sign-in-copy";

export type SignInErrorContext = "password" | "apple" | "google";

type ErrorShape = { code: string; retryable: boolean };

// Reads the fields both EquinaBackendError and the raw Apple, Google and
// browser errors carry. The provider's own message is never shown: on a server
// failure it can say what happened to which account.
const describe = (error: unknown): ErrorShape => {
  if (!error || typeof error !== "object") return { code: "", retryable: false };
  const candidate = error as { code?: unknown; retryable?: unknown };
  return {
    code: typeof candidate.code === "string" ? candidate.code : "",
    retryable: candidate.retryable === true
  };
};

/** The request never reached the auth service. */
export const isNetworkFailure = (error: unknown) => describe(error).code === networkUnreachable;

/**
 * What a failed sign-in attempt tells the rider. The outcome of a password
 * reset or an emailed sign-in link is not decided here: those always answer
 * with the same neutral notice, see `emailRequestOutcome`.
 */
export function signInErrorCopy(error: unknown, context: SignInErrorContext): string {
  const { code, retryable } = describe(error);
  if (code === "ERR_WEB_BROWSER_BLOCKED") return copy.errors.popupBlocked;
  if (code === "over_request_rate_limit") return copy.errors.tooManyAttempts;
  // Wrong password and unconfirmed email share one message: telling them apart
  // would confirm that the email has an account.
  if (context === "password" && (code === "invalid_credentials" || code === "email_not_confirmed")) {
    return copy.errors.badCredentials;
  }
  if (retryable) return copy.errors.unreachable;
  if (context === "apple") return copy.errors.appleFailed;
  if (context === "google") return copy.errors.googleFailed;
  return copy.errors.generic;
}

/**
 * Asking for a reset link or a sign-in link answers the same way whatever
 * happened, so the reply cannot reveal whether an account exists: "no such
 * user", a rate limit (which only applies to existing accounts) and a mailer
 * failure all read as "sent". The one exception is a request that never left
 * the device, which says nothing about any account.
 */
export const emailRequestOutcome = (error: unknown): "sent" | "unreachable" =>
  isNetworkFailure(error) ? "unreachable" : "sent";
