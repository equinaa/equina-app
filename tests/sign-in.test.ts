import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AuthRepository } from "../src/backend/auth-repository";
import { backendError, EquinaBackendError } from "../src/backend/errors";
import { visibleProviders } from "../src/features/account/provider-visibility";
import { signInCopy as copy } from "../src/features/account/sign-in-copy";
import {
  emailRequestOutcome,
  isNetworkFailure,
  signInErrorCopy
} from "../src/features/account/sign-in-errors";

// Provider visibility: App Store 4.8 and the iOS-only Apple flow.
{
  const both = { apple: true, google: true };
  const googleOnly = { apple: false, google: true };
  const appleOnly = { apple: true, google: false };
  assert.deepEqual(visibleProviders("ios", googleOnly), { apple: false, google: false },
    "Google alone on iOS would be rejected under guideline 4.8; it must stay hidden.");
  assert.deepEqual(visibleProviders("ios", both), { apple: true, google: true });
  assert.deepEqual(visibleProviders("ios", appleOnly), { apple: true, google: false });
  assert.deepEqual(visibleProviders("android", appleOnly), { apple: false, google: false },
    "Apple has no working flow off iOS.");
  assert.deepEqual(visibleProviders("android", both), { apple: false, google: true });
  assert.deepEqual(visibleProviders("web", googleOnly), { apple: false, google: true });
  assert.deepEqual(visibleProviders("ios", { apple: false, google: false }), { apple: false, google: false });
}

// supabase-js shapes, reduced to what backendError keeps.
const authError = (status: number, code?: string, name = "AuthApiError") =>
  backendError(Object.assign(new Error("provider text that must never reach the screen"), { status, code, name }), "fallback");
const offline = backendError(
  Object.assign(new Error("Network request failed"), { status: 0, name: "AuthRetryableFetchError" }),
  "fallback"
);

// Network detection names only a request that got no answer.
{
  assert.equal(isNetworkFailure(offline), true);
  assert.equal(offline.code, "network_unreachable");
  assert.equal(isNetworkFailure(authError(502, undefined, "AuthRetryableFetchError")), false,
    "A gateway error reached the service; it is not a lost connection.");
  assert.equal(isNetworkFailure(backendError(new Error("Password length is invalid."), "fallback")), false,
    "A plain local Error has status 0 too, and is not a network failure.");
  assert.equal(isNetworkFailure(new EquinaBackendError("x")), false);
}

// Sign-in failures.
{
  assert.equal(signInErrorCopy(authError(400, "invalid_credentials"), "password"), copy.errors.badCredentials);
  assert.equal(signInErrorCopy(authError(400, "email_not_confirmed"), "password"), copy.errors.badCredentials,
    "Unconfirmed and wrong password must read the same.");
  assert.equal(signInErrorCopy(authError(429, "over_request_rate_limit"), "password"), copy.errors.tooManyAttempts);
  assert.equal(signInErrorCopy(offline, "password"), copy.errors.unreachable);
  assert.equal(signInErrorCopy(authError(500, "unexpected_failure"), "password"), copy.errors.unreachable);
  assert.equal(signInErrorCopy(new Error("Apple sign-in state did not match."), "apple"), copy.errors.appleFailed);
  assert.equal(signInErrorCopy({ code: "ERR_WEB_BROWSER_BLOCKED" }, "google"), copy.errors.popupBlocked);
  assert.equal(signInErrorCopy(authError(400, "validation_failed"), "google"), copy.errors.googleFailed);
  assert.equal(signInErrorCopy(authError(422, "weak_password"), "password"), copy.errors.generic);
  assert.equal(signInErrorCopy(null, "password"), copy.errors.generic);
  // React Native's blob store losing a response after a reload, a storage read
  // failing: the app failed, no server did, and the copy must not blame the
  // connection.
  assert.equal(
    signInErrorCopy(backendError(Object.assign(new Error("Unable to resolve data for blob: X"), { code: "EUNSPECIFIED" }), "fallback"), "password"),
    copy.errors.generic
  );
  assert.equal(signInErrorCopy(backendError(new Error("Lock timed out"), "fallback"), "password"), copy.errors.generic);
  for (const context of ["password", "apple", "google"] as const) {
    assert.doesNotMatch(signInErrorCopy(authError(500), context), /provider text/,
      "The provider's message must never be shown.");
  }
}

// Reset and sign-in links never reveal whether an account exists.
{
  for (const code of [
    "otp_disabled",              // no such user, shouldCreateUser: false
    "user_not_found",
    "over_email_send_rate_limit", // only ever hits existing accounts
    "email_address_not_authorized",
    "unexpected_failure"          // "Error sending recovery email"
  ]) {
    assert.equal(emailRequestOutcome(authError(code === "unexpected_failure" ? 500 : 429, code)), "sent", code);
  }
  assert.equal(emailRequestOutcome(offline), "unreachable",
    "A request that never left the device says nothing about any account.");
  for (const notice of [copy.notices.recoverySent, copy.notices.signInLinkSent]) {
    assert.match(notice, /^If an Equina account uses this email/);
  }
}

// Sign-out: this device only, and the stored session goes even when
// supabase-js gives up before removing it (expired token, no network).
{
  const signOutWith = async (error: unknown) => {
    const calls: { scope?: string }[] = [];
    let forgotten = 0;
    const client = {
      auth: {
        signOut: async (options: { scope?: string }) => {
          calls.push(options);
          return { error };
        }
      }
    } as unknown as SupabaseClient;
    const auth = new AuthRepository(client, async () => {
      forgotten += 1;
    });
    let threw = false;
    try {
      await auth.signOut();
    } catch {
      threw = true;
    }
    return { calls, forgotten, threw };
  };

  const clean = await signOutWith(null);
  assert.deepEqual(clean.calls, [{ scope: "local" }], "Signing out here must not end other devices' sessions.");
  assert.equal(clean.forgotten, 0);
  assert.equal(clean.threw, false);

  const offline = await signOutWith(
    Object.assign(new Error("Network request failed"), { status: 0, name: "AuthRetryableFetchError" })
  );
  assert.equal(offline.forgotten, 1, "A failed sign-out must still remove the stored session.");
  assert.equal(offline.threw, true);
}

console.log("Sign-in rules passed.");
