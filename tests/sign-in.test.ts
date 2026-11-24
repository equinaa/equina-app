import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AuthRepository } from "../src/backend/auth-repository";
import { backendError, EquinaBackendError } from "../src/backend/errors";
import {
  newPasswordMinLength,
  newPasswordReady,
  passwordMaxLength,
  signInPasswordReady
} from "../src/features/account/password-rules";
import { visibleProviders } from "../src/features/account/provider-visibility";
import { emailStepCopy, signInCopy as copy } from "../src/features/account/sign-in-copy";
import {
  accountAlreadyExists,
  emailRequestOutcome,
  isNetworkFailure,
  needsEmailConfirmation,
  signInErrorCopy
} from "../src/features/account/sign-in-errors";
import { cleanCode, codeMaxLength, codeMinLength, codeReady } from "../src/features/account/verification-code";

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

// In code mode the rider gets a code and never a link, so no line that depends
// on the mode may send them looking for one.
{
  const link = emailStepCopy("magic-link");
  const code = emailStepCopy("otp");
  assert.equal(link.usePasswordless, "Use a secure email link instead");
  assert.equal(link.recoveryExpired, "The recovery session expired. Request a new recovery link.");
  assert.equal(code.usePasswordless, "Use a code sent by email instead");
  assert.equal(code.recoveryExpired, "The recovery session expired. Request a new reset code.");
  for (const line of Object.values(code)) assert.doesNotMatch(line, /\blink\b/i, `Code mode says "${line}".`);
  for (const line of Object.values(link)) assert.doesNotMatch(line, /\bcode\b/i, `Link mode says "${line}".`);

  // Both screens ask the mode instead of typing either word themselves.
  const root = process.cwd();
  const sheet = readFileSync(join(root, "src", "features", "onboarding", "OnboardingScreen.tsx"), "utf8");
  const app = readFileSync(join(root, "src", "App.tsx"), "utf8");
  assert.match(sheet, /emailStepCopy\(emailAuthMode\)\.usePasswordless/);
  assert.match(app, /emailStepCopy\(equinaSession\.emailAuthMode\)\.recoveryExpired/);
  assert.doesNotMatch(sheet, /Use a secure email link instead/);
  assert.doesNotMatch(app, /Request a new recovery link/);
  // Every other line of the sheet that says "link" is chosen by the mode on
  // that line or the one above it.
  const sheetLines = sheet.split("\n");
  for (const [index, text] of sheetLines.entries()) {
    if (!/"[^"]*\blink\b[^"]*"/.test(text) || /testID=|accessibilityRole=/.test(text)) continue;
    assert.match(`${sheetLines[index - 1] ?? ""}\n${text}`, /emailAuthMode === "magic-link"/,
      `OnboardingScreen.tsx:${index + 1} says "link" whatever the mode.`);
  }
}

// The emailed code. Its length is set in the hosted project (6 to 10 digits)
// and cannot be read from outside, and a store build cannot be patched: the
// field must take whatever the server sends.
{
  assert.equal(codeMinLength, 6);
  assert.equal(codeMaxLength, 10, "Supabase Auth allows an email OTP of 6 to 10 digits.");
  assert.equal(cleanCode("123456"), "123456");
  assert.equal(cleanCode(" 123 456\n"), "123456", "Pasted with spaces around or inside.");
  assert.equal(cleanCode("Your Equina sign-in code: 12345678"), "12345678", "Pasted with the subject line.");
  assert.equal(cleanCode("12a3"), "123");
  assert.equal(cleanCode("1234567890"), "1234567890", "The longest code the server can send fits.");
  assert.equal(cleanCode("12345678901234"), "1234567890");
  assert.equal(cleanCode(""), "");

  for (const length of [0, 1, 5]) assert.equal(codeReady("1".repeat(length)), false, `${length} digits is not a code yet.`);
  for (const length of [6, 7, 8, 9, 10]) assert.equal(codeReady("1".repeat(length)), true, `A ${length}-digit code can be sent.`);
  assert.equal(codeReady("1".repeat(11)), false);

  const root = process.cwd();
  const screen = readFileSync(join(root, "src", "features", "account", "AuthVerificationScreen.tsx"), "utf8");
  assert.doesNotMatch(screen, /length\s*[!=]==\s*6|slice\(0,\s*6\)|maxLength=\{6\}/, "Nothing on the code screen counts to six.");
  assert.doesNotMatch(screen, /maxLength=/, "A native limit cuts pasted text before the digits are picked out.");
  assert.match(screen, /onChangeText=\{\(value\) => setCode\(cleanCode\(value\)\)\}/);
  // The code is sent by the Done key and by the button, when it can be a whole
  // code, and by nothing else: sending at six digits would cut a longer one.
  assert.deepEqual(
    [...screen.matchAll(/^.*onVerify\(code\).*$/gm)].map(([line]) => line.trim()),
    ["onSubmitEditing={() => codeReady(code) && onVerify(code)}", "onPress={() => onVerify(code)}"]
  );
  assert.match(screen, /disabled=\{!codeReady\(code\) \|\| verifying\}/);
  assert.doesNotMatch(screen, /useEffect\([^)]*onVerify/, "No effect verifies on the rider's behalf.");

  // No screen names a length the server may not use.
  const lengthWords = /six[- ]digit|6[- ]digit|\b0{6,10}\b/i;
  assert.doesNotMatch(screen, lengthWords);
  assert.doesNotMatch(readFileSync(join(root, "src", "features", "onboarding", "OnboardingScreen.tsx"), "utf8"), lengthWords);
  assert.doesNotMatch(readFileSync(join(root, "src", "App.tsx"), "utf8"), /six[- ]digit|6[- ]digit/i);

  // The local project's own setting stays inside what the field accepts.
  const otpLength = Number(readFileSync(join(root, "supabase", "config.toml"), "utf8").match(/^otp_length = (\d+)$/m)?.[1]);
  assert.ok(otpLength >= codeMinLength && otpLength <= codeMaxLength, "supabase/config.toml otp_length");
}

// The 10-character minimum is for choosing a password. Signing in takes the
// password the account has: one set by staff can be shorter, and the form must
// still let the rider try it.
{
  for (const password of ["x", "short", "123456789", "a password of ten or more", " "]) {
    assert.equal(signInPasswordReady(password), true, `"${password}" can be tried.`);
  }
  assert.equal(signInPasswordReady(""), false, "An empty password is the only one the form refuses.");

  assert.equal(newPasswordMinLength, 10);
  assert.equal(passwordMaxLength, 128);
  assert.equal(newPasswordReady("x".repeat(9)), false);
  assert.equal(newPasswordReady("x".repeat(10)), true);
  assert.equal(newPasswordReady("x".repeat(128)), true);
  assert.equal(newPasswordReady("x".repeat(129)), false);

  // The repository agrees: nothing is checked locally on the way in, and a new
  // password outside the limits never reaches the server.
  const calls: { method: string; password: string }[] = [];
  const session = { access_token: "a" };
  const client = {
    auth: {
      signInWithPassword: async (input: { password: string }) => {
        calls.push({ method: "signIn", password: input.password });
        return { data: { session }, error: null };
      },
      signUp: async (input: { password: string }) => {
        calls.push({ method: "signUp", password: input.password });
        return { data: { user: { id: "u", identities: [{ id: "i" }] }, session: null }, error: null };
      },
      updateUser: async (input: { password: string }) => {
        calls.push({ method: "update", password: input.password });
        return { data: {}, error: null };
      }
    }
  } as unknown as SupabaseClient;
  const auth = new AuthRepository(client);
  assert.equal(await auth.signInWithPassword(" Rider@Example.com ", "short"), session);
  await assert.rejects(auth.signUpWithPassword({ email: "rider@example.com", password: "short" }), /Password length is invalid/);
  await assert.rejects(auth.setPassword("short"), /Password length is invalid/);
  await assert.rejects(auth.setPassword("x".repeat(129)), /Password length is invalid/);
  assert.deepEqual(calls, [{ method: "signIn", password: "short" }], "Only the sign-in reached the service.");

  // The sheet serves both: each method asks its own rule, and neither the
  // sheet nor the onboarding handlers count characters themselves.
  const sheet = readFileSync(join(process.cwd(), "src", "features", "onboarding", "OnboardingScreen.tsx"), "utf8");
  assert.doesNotMatch(sheet, /password\.length/, "Password rules live in password-rules.ts.");
  assert.match(sheet, /const passwordReady = method === "signin" \? signInPasswordReady\(password\) : newPasswordReady\(password\);/);
  assert.match(sheet, /const signInWithPassword = async \(\) => \{\n    if \(!emailReady \|\| !signInPasswordReady\(password\)/);
  assert.match(sheet, /const continueWithPassword = async \(\) => \{\n    if \(!emailReady \|\| !newPasswordReady\(password\)/);
  assert.match(sheet, /placeholder=\{method === "signin" \? "Your password" : "10\+ characters"\}/,
    "The sign-in field does not ask for the length a new password needs.");
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

// An unconfirmed email goes to the code screen; a wrong password does not.
// Auth only says "not confirmed" after the password matched.
{
  assert.equal(needsEmailConfirmation(authError(400, "email_not_confirmed")), true);
  assert.equal(needsEmailConfirmation(authError(400, "invalid_credentials")), false);
  assert.equal(needsEmailConfirmation(offline), false);
  assert.equal(accountAlreadyExists(authError(422, "user_already_exists")), true);
  assert.equal(accountAlreadyExists(authError(422, "email_exists")), true);
  assert.equal(accountAlreadyExists(authError(422, "weak_password")), false);
}

// Password sign-up, against what Auth answers with confirmation on.
{
  const signUpAnswering = (data: { user: unknown; session: unknown }, error: unknown = null) => {
    const sent: unknown[] = [];
    const client = {
      auth: {
        signUp: async (input: unknown) => {
          sent.push(input);
          return { data, error };
        }
      }
    } as unknown as SupabaseClient;
    return { auth: new AuthRepository(client), sent };
  };
  const input = { email: " Rider@Example.com ", password: "long enough password", redirectTo: "equina://auth/email" };

  const fresh = signUpAnswering({ user: { id: "u1", identities: [{ id: "i1" }] }, session: null });
  assert.equal(await fresh.auth.signUpWithPassword(input), null, "A new account waits for its code.");
  assert.equal((fresh.sent[0] as { email: string }).email, "rider@example.com");

  // A confirmed address gets a stand-in user with no identities, no error and
  // no email. Waiting for a code here would wait forever.
  const taken = signUpAnswering({ user: { id: "fake", identities: [] }, session: null });
  await assert.rejects(taken.auth.signUpWithPassword(input), (error: unknown) => accountAlreadyExists(error));

  const session = { access_token: "a" };
  const autoconfirmed = signUpAnswering({ user: { id: "u2", identities: [] }, session });
  assert.equal(await autoconfirmed.auth.signUpWithPassword(input), session,
    "With a session the account was created and signed in; nothing to refuse.");

  const refused = signUpAnswering({ user: null, session: null }, Object.assign(new Error("User already registered"), { status: 422, code: "user_already_exists", name: "AuthApiError" }));
  await assert.rejects(refused.auth.signUpWithPassword(input), (error: unknown) => accountAlreadyExists(error));
}

// Resending a sign-up confirmation resends that, not a sign-in.
{
  const calls: unknown[] = [];
  const client = {
    auth: {
      resend: async (input: unknown) => {
        calls.push(input);
        return { data: { user: null, session: null }, error: null };
      }
    }
  } as unknown as SupabaseClient;
  await new AuthRepository(client).resendSignupConfirmation(" Rider@Example.com ", "equina://auth/email");
  assert.deepEqual(calls, [{ type: "signup", email: "rider@example.com", options: { emailRedirectTo: "equina://auth/email" } }]);
}

// Auth emails: every template exists, and the ones the app asks a code for
// carry the code and no link -- a mail scanner opening links would use it up.
{
  const root = process.cwd();
  const config = readFileSync(join(root, "supabase", "config.toml"), "utf8");
  assert.match(config, /^enable_confirmations = true$/m, "The hosted project confirms emails; local must match.");
  const templates = [...config.matchAll(/\[auth\.email\.template\.(\w+)\]\nsubject = "([^"]+)"\ncontent_path = "\.\/([^"]+)"/g)]
    .map(([, name = "", subject = "", path = ""]) => ({ name, subject, path }));
  assert.deepEqual(templates.map((template) => template.name).sort(),
    ["confirmation", "email_change", "magic_link", "reauthentication", "recovery"]);
  for (const template of templates) {
    assert.ok(existsSync(join(root, template.path)), template.path);
    const html = readFileSync(join(root, template.path), "utf8");
    assert.doesNotMatch(html, /\{\{\s*\.(SiteURL|RedirectTo)/, `${template.name}: no links built by hand.`);
    if (template.name === "email_change") continue;
    assert.match(html, /\{\{ \.Token \}\}/, `${template.name} must carry the code.`);
    assert.doesNotMatch(html, /ConfirmationURL|TokenHash/, `${template.name} must not carry a link.`);
    assert.match(template.subject, /\{\{ \.Token \}\}/, `${template.name}: the code in the subject fills it in from Mail.`);
  }
}

console.log("Sign-in rules passed.");
