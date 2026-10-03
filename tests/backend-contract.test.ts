import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { equinaFeatureFlags } from "../src/config/feature-flags";
import { readBackendConfig } from "../src/backend/config";
import {
  createChunkedSessionStorage,
  type AsyncStringStore
} from "../src/backend/chunked-session-storage";

const root = process.cwd();
const migrationsDir = join(root, "supabase", "migrations");
const migrationFiles = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort();
assert.ok(migrationFiles.length >= 7, "Expected the complete backend migration set.");
const sql = migrationFiles.map((name) => readFileSync(join(migrationsDir, name), "utf8")).join("\n");

const protectedTables = [
  "profiles", "horses", "horse_records", "horse_record_files",
  "club_posts", "club_comments", "club_reactions", "content_reports", "user_blocks",
  "seller_accounts", "listings", "listing_photos", "marketplace_conversations",
  "marketplace_messages", "checkout_quotes", "orders", "order_events", "shipments",
  "order_disputes", "dispute_evidence", "marketplace_reviews", "marketplace_reports",
  "upload_tickets", "storage_cleanup_jobs", "content_moderation_jobs", "user_sanctions"
  , "user_preferences", "notification_preferences", "push_devices", "notification_outbox",
  "data_export_requests", "account_audit_events", "coach_conversations", "coach_messages",
  "coach_message_operations", "coach_message_feedback", "coach_safety_events", "coach_usage_events",
  "onboarding_starter_packs", "feature_flag_overrides"
];

for (const table of protectedTables) {
  assert.match(sql, new RegExp(`create table public\\.${table}\\s*\\(`, "i"), `${table} must exist.`);
  assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"), `${table} must enable RLS.`);
}

assert.match(sql, /create function public\.begin_checkout_for_user/i);
assert.match(sql, /for update;/i, "Checkout must lock the listing and quote rows.");
assert.match(sql, /unique \(buyer_id, idempotency_key\)/i);
assert.match(sql, /create trigger orders_transition/i);
assert.match(sql, /create trigger marketplace_messages_safety/i);
assert.match(sql, /private\.feature_enabled/i, "Server mutations must honor rollout gates.");
assert.match(sql, /feature_flag_overrides/i, "Internal rollout must support named-user overrides.");
assert.match(sql, /profiles_unlock_starter_pack/i, "Onboarding completion must unlock the starter pack server-side.");
assert.match(sql, /marketplace_terms_version/i, "Checkout must record accepted terms.");
assert.match(sql, /storage\.buckets/i);
assert.match(sql, /supabase_realtime/i);

const functionNames = [
  "backend-capabilities", "create-upload-ticket", "complete-upload", "delete-horse-record",
  "delete-club-post", "delete-listing-draft", "delete-upload-asset", "seller-onboarding", "quote-checkout", "create-checkout",
  "cancel-checkout", "stripe-webhook", "release-order", "resolve-dispute", "review-listing", "process-order-deadlines",
  "process-storage-cleanup", "process-content-moderation", "moderate-report", "lift-sanction"
  , "coach-chat", "request-data-export", "schedule-account-deletion", "cancel-account-deletion",
  "process-account-deletions", "process-data-export-cleanup", "register-push-device",
  "revoke-push-device", "process-notification-outbox"
];
for (const name of functionNames) {
  assert.ok(existsSync(join(root, "supabase", "functions", name, "index.ts")), `${name} Edge Function must exist.`);
}

const mobileSource = readdirSync(join(root, "src", "backend"))
  .filter((name) => name.endsWith(".ts"))
  .map((name) => readFileSync(join(root, "src", "backend", name), "utf8"))
  .join("\n");
assert.doesNotMatch(mobileSource, /SUPABASE_SERVICE_ROLE_KEY|STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET/);
assert.doesNotMatch(mobileSource, /EQUINA_AI_API_KEY|ACCOUNT_AUTOMATION_SECRET|NOTIFICATION_AUTOMATION_SECRET/);

const secureStorageSource = readFileSync(join(root, "src", "backend", "secure-session-storage.ts"), "utf8");
assert.match(secureStorageSource, /expo-secure-store/);
assert.match(secureStorageSource, /WHEN_UNLOCKED_THIS_DEVICE_ONLY/);
assert.match(secureStorageSource, /chunk/i, "Native session storage must split large session values.");

const memoryStore = () => {
  const values = new Map<string, string>();
  const store: AsyncStringStore = {
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      values.set(key, value);
    },
    async removeItem(key) {
      values.delete(key);
    }
  };
  return { values, store };
};
const secureMemory = memoryStore();
const legacyMemory = memoryStore();
const chunkedStorage = createChunkedSessionStorage({
  secureStore: secureMemory.store,
  legacyStore: legacyMemory.store,
  chunkSize: 8
});
const longSession = "session:" + "secure-token-material-".repeat(8);
await chunkedStorage.setItem("auth-key", longSession);
assert.equal(await chunkedStorage.getItem("auth-key"), longSession);
assert.ok(secureMemory.values.size > 2, "A large native session must use multiple secure items.");
await chunkedStorage.setItem("auth-key", "short");
assert.equal(await chunkedStorage.getItem("auth-key"), "short");
assert.equal(secureMemory.values.size, 2, "Shrinking a session must remove stale secure chunks.");

const failureMemory = memoryStore();
let secureSetCalls = 0;
let failOnSecureSet = 0;
const failureSafeStorage = createChunkedSessionStorage({
  secureStore: {
    ...failureMemory.store,
    async setItem(key, value) {
      secureSetCalls += 1;
      if (secureSetCalls === failOnSecureSet) throw new Error("injected_secure_store_failure");
      await failureMemory.store.setItem(key, value);
    }
  },
  legacyStore: memoryStore().store,
  chunkSize: 8
});
await failureSafeStorage.setItem("failure-key", "previous-session-remains-valid");
const valuesBeforeFailedWrite = new Map(failureMemory.values);
failOnSecureSet = secureSetCalls + 2;
await assert.rejects(
  failureSafeStorage.setItem("failure-key", "replacement-session-that-spans-several-chunks"),
  /injected_secure_store_failure/
);
assert.equal(
  await failureSafeStorage.getItem("failure-key"),
  "previous-session-remains-valid",
  "A partial next-generation write must not corrupt the active native session."
);
assert.deepEqual(
  failureMemory.values,
  valuesBeforeFailedWrite,
  "Failed session generations must be cleaned without leaking stale chunks."
);

await legacyMemory.store.setItem("legacy-auth", longSession);
assert.equal(await chunkedStorage.getItem("legacy-auth"), longSession);
assert.equal(await legacyMemory.store.getItem("legacy-auth"), null, "Legacy session data must be removed after migration.");
await chunkedStorage.removeItem("auth-key");
await chunkedStorage.removeItem("legacy-auth");
assert.equal(secureMemory.values.size, 0, "Sign out must remove all secure session chunks.");

const supabaseClientSource = readFileSync(join(root, "src", "backend", "supabase-client.ts"), "utf8");
const authRepositorySource = readFileSync(join(root, "src", "backend", "auth-repository.ts"), "utf8");
const socialAuthSource = readFileSync(join(root, "src", "features", "account", "social-auth.ts"), "utf8");
const appConfigSource = readFileSync(join(root, "app.json"), "utf8");
assert.match(supabaseClientSource, /flowType:\s*"pkce"/, "Social auth must use PKCE.");
assert.match(authRepositorySource, /signInWithOAuth/);
assert.match(authRepositorySource, /signUp\(/, "Password account creation must use Supabase Auth.");
assert.match(authRepositorySource, /signInWithPassword/, "Password sign-in must use Supabase Auth.");
assert.match(authRepositorySource, /resetPasswordForEmail/, "Password recovery must use Supabase Auth.");
assert.match(authRepositorySource, /exchangeCodeForSession/);
assert.match(authRepositorySource, /signInWithIdToken/);
assert.match(authRepositorySource, /updateUser\(\{\s*password\s*\}\)/);
assert.match(socialAuthSource, /CryptoDigestAlgorithm\.SHA256/);
assert.match(socialAuthSource, /credential\.state\s*!==\s*state/);
assert.match(appConfigSource, /"usesAppleSignIn":\s*true/);
assert.match(appConfigSource, /"expo-apple-authentication"/);
assert.doesNotMatch(socialAuthSource, /console\.(log|error)/);
// Unconfirmed sign-ups and automatic identity linking must never be live at the
// same time: with confirmations off, someone could register a rider's email
// with a password before the rider signs in with Apple or Google, and keep
// access after the accounts link.
const authConfig = readFileSync(join(root, "supabase", "config.toml"), "utf8");
const envExample = readFileSync(join(root, ".env.example"), "utf8");
if (/^enable_confirmations\s*=\s*false/m.test(authConfig)) {
  assert.match(envExample, /^EXPO_PUBLIC_ENABLE_APPLE_AUTH=false$/m,
    "Apple sign-in must stay off while email confirmations are off.");
  assert.match(envExample, /^EXPO_PUBLIC_ENABLE_GOOGLE_AUTH=false$/m,
    "Google sign-in must stay off while email confirmations are off.");
}
// Auth code handles emails, passwords, tokens and codes. None of it may log,
// and a new file in these folders is covered without being listed here.
for (const directory of [join(root, "src", "features", "account"), join(root, "src", "backend")]) {
  for (const fileName of readdirSync(directory).filter((name) => /\.tsx?$/.test(name))) {
    const source = readFileSync(join(directory, fileName), "utf8");
    assert.doesNotMatch(source, /console\.\w+\(/, `${fileName} must not log.`);
  }
}

const coachEdgeSource = readFileSync(join(root, "supabase", "functions", "coach-chat", "index.ts"), "utf8");
assert.match(coachEdgeSource, /EQUINA_AI_API_KEY/);
assert.match(coachEdgeSource, /AbortController/);
assert.match(coachEdgeSource, /health_escalation/);
assert.match(coachEdgeSource, /clientNonce/);
assert.doesNotMatch(coachEdgeSource, /console\.(log|error)\([^)]*(message|email|token|authorization)/i);

const notificationEdgeSource = readFileSync(join(root, "supabase", "functions", "process-notification-outbox", "index.ts"), "utf8");
assert.doesNotMatch(notificationEdgeSource, /message\.body|payload\.body/);
const deletionEdgeSource = readFileSync(join(root, "supabase", "functions", "process-account-deletions", "index.ts"), "utf8");
assert.match(deletionEdgeSource, /queueStorageCleanup/);
// Rows are erased by erase_account_data in one transaction; which tables it
// reaches is proven in backend-migrations.test.ts. Storage paths must be read
// and queued before the rows that hold them are gone.
assert.match(deletionEdgeSource, /rpc\("erase_account_data"/);
assert.ok(
  deletionEdgeSource.lastIndexOf("queueStorageCleanup(") < deletionEdgeSource.indexOf('rpc("erase_account_data"'),
  "Storage paths must be queued before the rows holding them are erased."
);
assert.ok(
  deletionEdgeSource.indexOf('rpc("erase_account_data"') < deletionEdgeSource.indexOf("deleteUser(userId, true)"),
  "The account's data must be erased before its sign-in is removed."
);
assert.ok(
  deletionEdgeSource.indexOf("deleteUser(userId, true)") <
    deletionEdgeSource.indexOf("deletion_completed"),
  "Deletion must not be recorded complete before Auth soft deletion succeeds."
);
const exportCleanupSource = readFileSync(join(root, "supabase", "functions", "process-data-export-cleanup", "index.ts"), "utf8");
assert.match(exportCleanupSource, /account-exports/);
assert.match(exportCleanupSource, /claim_data_export_cleanup/);
assert.match(exportCleanupSource, /complete_data_export_cleanup/);
assert.match(exportCleanupSource, /cleanup_lease_token/);

const completeUploadSource = readFileSync(join(root, "supabase", "functions", "complete-upload", "index.ts"), "utf8");
const mediaSafetySource = readFileSync(join(root, "supabase", "functions", "_shared", "media-safety.ts"), "utf8");
assert.match(completeUploadSource, /inspectUploadForMalware/);
assert.ok(
  completeUploadSource.indexOf("inspectUploadForMalware") <
    completeUploadSource.indexOf('ticket.kind === "avatar"'),
  "Malware inspection must run before an active media reference is created."
);
assert.match(mediaSafetySource, /MALWARE_SCAN_REQUIRED/);
assert.match(mediaSafetySource, /media_scan_unavailable/);
assert.doesNotMatch(mediaSafetySource, /console\.(log|error)/);

const oldUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const oldKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
delete process.env.EXPO_PUBLIC_SUPABASE_URL;
delete process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
assert.equal(readBackendConfig(), null);
if (oldUrl === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_URL;
else process.env.EXPO_PUBLIC_SUPABASE_URL = oldUrl;
if (oldKey === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
else process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = oldKey;

assert.equal(equinaFeatureFlags.clubPublishing, false);
assert.equal(equinaFeatureFlags.shopTransactions, false);
assert.equal(equinaFeatureFlags.recordMutations, false);

// Every scheduled worker must be called with the header that worker reads.
//
// The workers disagree on the name -- some read x-automation-secret, some
// x-equina-cron-secret -- and a cron job sending the wrong one is a 401 on
// every run that nothing reports. A schedule copied from a neighbouring job
// inherits the neighbour's header, which is exactly how this was nearly
// shipped for account deletions.
{
  const functionsDir = join(root, "supabase", "functions");
  const expectedHeader = new Map<string, string>();
  for (const name of readdirSync(functionsDir)) {
    if (!name.startsWith("process-")) continue;
    const entry = join(functionsDir, name, "index.ts");
    if (!existsSync(entry)) continue;
    const source = readFileSync(entry, "utf8");
    const call = source.match(/requireAutomationSecret\(\s*request,\s*"[A-Z_]+",\s*"(x-[a-z-]+)"/);
    if (call) expectedHeader.set(name, call[1] as string);
  }
  assert.ok(expectedHeader.size >= 4, "Expected to find the automation workers and the header each reads.");

  for (const file of migrationFiles) {
    const migration = readFileSync(join(migrationsDir, file), "utf8");
    if (!migration.includes("cron.schedule")) continue;
    const target = migration.match(/\/(process-[a-z-]+)['"]/);
    if (!target) continue;
    const worker = target[1] as string;
    const expected = expectedHeader.get(worker);
    assert.ok(expected, `${file} schedules ${worker}, which does not read an automation secret.`);
    const sent = [...migration.matchAll(/'(x-[a-z-]+)'\s*,\s*\(/g)].map((match) => match[1]);
    assert.ok(
      sent.includes(expected),
      `${file} calls ${worker} with ${sent.join(", ") || "no secret header"}, but ${worker} reads ${expected}.`
    );
  }
}

console.log("Backend security contracts passed.");