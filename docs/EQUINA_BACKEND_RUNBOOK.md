# Equina Backend Runbook

## Status

The repository contains the additive backend boundary for Account, secure session
handoff, Ralf conversations, buyer/seller messaging, notification preferences,
native device registration, redacted push delivery, export, and scheduled account
deletion. It also preserves the earlier Horse Records, Club, listings, checkout,
orders, disputes, refunds, moderation, payout, and storage-cleanup foundation.

The repository is linked to Supabase project `mvdxohyayriywbcknulg` in Frankfurt.
All 34 migrations are applied and remotely lint clean. Six functions are deployed:
capabilities, the four Horse/Records upload/delete boundaries, and Storage cleanup.
Storage cleanup runs every five minutes. One named internal user receives Horse and
Records; all global sensitive rollouts, Club, messaging, Ralf, and checkout remain
off. SMTP, social auth, scanner/processing providers, monitoring, staging
separation, and physical-device evidence are absent.

## Chosen Stack

- Supabase Auth with magic-link delivery until custom SMTP is configured; OTP,
  password recovery, Apple, and Google require separate production proof.
- Supabase Postgres with default-deny RLS and explicit grants.
- Supabase Realtime for Ralf and marketplace message inserts.
- Supabase Storage private buckets, including `account-exports`.
- Supabase Edge Functions for provider, export, account, device, notification,
  storage, moderation, seller, tax, payment, refund, and payout operations.
- `expo-secure-store` chunked native session storage; Supabase browser storage on
  HTTPS web.
- `expo-notifications` for contextual permission, device tokens, and deep links.
- A provider-agnostic OpenAI-compatible server adapter for Ralf.
- Stripe Connect Express with separate charges and delayed transfer. This is
  protected payment, not legal escrow.

## Sprint 4 Domain Coverage

### Account And Session

`user_preferences`, `notification_preferences`, `push_devices`,
`data_export_requests`, `account_audit_events`, and the existing
`account_deletion_requests` support self-owned settings, private exports, explicit
device lifecycle, auditable deletion, and a 14-day cancellation window.

The client restores auth before choosing a route. Native session JSON is split
across secure-store chunks and migrates legacy AsyncStorage data. The final
onboarding handoff uses one idempotent database operation. Direct authenticated
mutation of deletion requests is revoked; schedule/cancel must pass through Edge
Functions.

### Ralf

`coach_conversations`, `coach_messages`, `coach_message_feedback`,
`coach_message_operations`, `coach_safety_events`, and `coach_usage_events` provide
owner-only history, server-owned generation, feedback, safe public source labels,
provider metadata isolation, nonce idempotency, and database rate limits.

The `coach-chat` function authenticates, loads consented context, validates selected
horse access, applies deterministic safety escalation, calls the configured provider
with a 15-second timeout, validates output, persists the user/assistant pair, and
returns typed failures. Its deterministic adapter is accepted only when explicitly
enabled against localhost.

### Human Messaging And Push

The existing marketplace repository remains the only buyer/seller chat backend. It
supports participant-only threads, 50-message pagination, stable nonces, read state,
archive, sender deletion, report, block, rate limits, and Realtime.

A database trigger creates a deduplicated outbox event without message content.
`process-notification-outbox` rechecks category preferences and quiet hours, sends a
minimal Expo payload, retries with bounded backoff, dead-letters repeated failures,
and revokes `DeviceNotRegistered` tokens. Push is requested only after a rider
enables a relevant category.

### Existing Domains

Horse Records, Club, listings, checkout, orders, inspection, disputes, refunds,
seller payouts, moderation, and file cleanup remain implemented but independently
gated. Sprint 4 does not activate or redesign those journeys.

## First Deployment

1. Create an EU Supabase staging project and record its project ref.
2. Install and authenticate the Supabase CLI, then link and push:

   ```bash
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase db push
   ```

3. Configure all required server secrets. Never prefix these with `EXPO_PUBLIC_`:

   ```bash
   npx supabase secrets set \
     EQUINA_AI_API_URL=https://YOUR_AI_PROVIDER/v1/responses \
     EQUINA_AI_API_KEY=REPLACE \
     EQUINA_AI_MODEL=REPLACE \
     EQUINA_AI_DEVELOPMENT_FALLBACK=false \
     ACCOUNT_AUTOMATION_SECRET=REPLACE_WITH_32_PLUS_RANDOM_BYTES \
     NOTIFICATION_AUTOMATION_SECRET=REPLACE_WITH_DIFFERENT_RANDOM_BYTES \
     EXPO_ACCESS_TOKEN=REPLACE_IF_REQUIRED \
     STRIPE_SECRET_KEY=sk_test_REPLACE \
     STRIPE_WEBHOOK_SECRET=whsec_REPLACE \
     MARKETPLACE_TERMS_VERSION=2026-07-21 \
     MARKETPLACE_FEE_BPS=800 \
     CONNECT_RETURN_URL=equina://seller/return \
     CONNECT_REFRESH_URL=equina://seller/refresh \
     ORDER_AUTOMATION_SECRET=REPLACE_WITH_ANOTHER_RANDOM_SECRET \
     MODERATION_AUTOMATION_SECRET=REPLACE_WITH_A_SEPARATE_RANDOM_SECRET \
     STORAGE_AUTOMATION_SECRET=REPLACE_WITH_ONE_MORE_RANDOM_SECRET \
     SENTRY_DSN=REPLACE_SERVER_SIDE_ONLY \
     MALWARE_SCAN_URL=https://YOUR_PRIVATE_SCANNER/scan \
     MALWARE_SCAN_TOKEN=REPLACE_SERVER_SIDE_ONLY \
     MALWARE_SCAN_REQUIRED=true \
     CONTENT_MODERATION_URL=https://YOUR_MODERATION_ADAPTER/review \
     CONTENT_MODERATION_TOKEN=REPLACE
   ```

4. Configure `TAX_QUOTE_URL` and `TAX_QUOTE_TOKEN` before any business-seller
   checkout rollout.
5. Deploy only the functions approved for the capability under test. For example,
   the upload boundary requires all four functions below before any media mutation
   flag is enabled:

   ```bash
   npx supabase functions deploy create-upload-ticket
   npx supabase functions deploy complete-upload
   npx supabase functions deploy delete-upload-asset
   npx supabase functions deploy process-storage-cleanup
   ```

   Do not use an all-functions deploy as a shortcut around missing provider secrets,
   worker schedules, or staging evidence.

6. Configure Supabase Cron or an equivalent authenticated scheduler:

   | Function | Frequency | Header |
   | --- | --- | --- |
   | `process-notification-outbox` | every minute | `x-automation-secret: NOTIFICATION_AUTOMATION_SECRET` |
   | `process-account-deletions` | hourly | `x-automation-secret: ACCOUNT_AUTOMATION_SECRET` |
   | `process-data-export-cleanup` | hourly | `x-automation-secret: ACCOUNT_AUTOMATION_SECRET` |
   | `process-order-deadlines` | every five minutes | `x-equina-cron-secret: ORDER_AUTOMATION_SECRET` |
   | `process-content-moderation` | every minute | `x-equina-cron-secret: MODERATION_AUTOMATION_SECRET` |
   | `process-storage-cleanup` | every five minutes | `x-equina-cron-secret: STORAGE_AUTOMATION_SECRET` |

7. Verify that `process-data-export-cleanup` removes expired private objects, marks
   requests `expired`, and leaves failed storage deletes in the retry queue.
8. Configure Auth redirect URLs for `equina://auth/callback`,
   `equina://auth/email`, `equina://auth/recovery`, each web callback, the staging
   URL, and the production domain.
9. Add only public values from `.env.example` to EAS/Vercel:
   Supabase URL/publishable key, Stripe publishable key, EAS project ID, and
   emergency-off switches. Keep `EXPO_PUBLIC_EQUINA_DEMO_MODE` false.
10. Register the Stripe webhook only for transaction staging and subscribe to the
    documented payment/account events from the earlier commerce runbook.

## Capability Activation

Effective client access is:

```text
compile-time failsafe
AND authenticated backend capability
AND screen precondition
AND server authorization at mutation time
```

All database flags seed to `enabled = false`, `rollout_percent = 0`. Activate one
capability at a time for named internal test users:

1. `account_settings`: auth restore, OTP, idempotent handoff, preference rollback,
   export, secure storage, sign-out clearing, recent-auth deletion, worker, and
   recovery states pass.
2. `coach_chat`: production provider, consent filtering, output validation, health
   escalation, timeout, idempotency, rate limits, history, and three-user isolation
   pass.
3. `shop_messaging`: two real users exercise thread load, optimistic retry,
   pagination, Realtime dedupe, unread clear, archive/report/block/unblock, and a
   third user cannot subscribe or infer the thread.
4. `push_notifications`: iOS and Android permission, rotation, sign-out revoke,
   category suppression, quiet hours, redacted payload, deep link, retry, and
   invalid-token cleanup pass.

Horse and Records may run only for the named internal override. Club, listing
creation, checkout, and every global rollout remain off until their own gates pass.
A server flag never compensates for a missing provider secret or compile-time
failsafe.

## Staging Verification

### Automated

Run:

```bash
npm test
npm run typecheck
npm run backend:check
npm run backend:audit
npm run security:bundle-scan
npx expo-doctor
npx expo export --platform web
npx expo export --platform ios
npx expo export --platform android
```

Then run the same migration/RLS suite against the linked staging database. PGlite
proves SQL policy behavior but does not exercise Supabase Auth, Realtime channel
authorization, Storage signed URLs, or Edge networking.

### Three-User Security

- Anonymous cannot read preferences or either chat.
- Rider C cannot read, mutate, subscribe to, or infer A/B Ralf or marketplace data.
- A client cannot insert assistant/system roles or provider/safety fields.
- A client cannot register/read/revoke another rider's push token.
- Direct account-deletion insert/update is denied.
- Blocked users cannot start or continue marketplace messaging.
- Duplicate nonces produce one human message or one Ralf pair.
- Disabled notification categories produce no provider delivery.
- Ralf cannot load a horse outside the rider's authorized set.

### Device And Failure Matrix

- iPhone and Android: install, OTP paste/resend/expiry, secure restore after process
  kill, refresh-token expiry, sign out, and account recovery.
- Two devices/users: foreground/background messaging, reconnect, Realtime replay,
  unread clear, archive, report, block, reply, and notification deep link.
- Ralf: provider timeout, malformed/oversized output, unavailable provider, limit,
  duplicate retry, prompt injection, and health/welfare escalation.
- Both conversations: keyboard open, multiline cap, offline retry, long history,
  route cleanup, reduced motion, and no duplicate subscription.
- Account: optimistic rollback, long names/locales, export expiry, deletion cancel,
  and deletion worker audit.
- Confirm generated web/native bundles contain no service-role, AI, automation,
  Stripe-secret, webhook, or push credentials.

## Operations

- Alert on notification dead letters, provider error rate, AI safety events awaiting
  review, account-deletion failures, storage cleanup failures, and webhook retries.
- Logs use request IDs and stable error codes. Never log message/prompt bodies,
  emails, tokens, OTPs, authorization headers, horse health notes, or raw provider
  responses.
- Rotate automation/provider secrets independently. A suspected client public-key
  leak is handled by RLS and key rotation; a service-role leak requires immediate
  secret rotation, flag disablement, audit, and incident response.
- Revoke push devices on sign out and invalid provider receipts.
- Review Ralf safety events through restricted staff tooling before resolving them.

## Rollback

1. Disable the affected database rollout flag and compile-time switch first.
2. Stop the matching scheduler/provider traffic.
3. Preserve user, message, audit, order, and legal records; do not drop additive
   tables as an emergency rollback.
4. Deploy a forward fix, rerun three-user tests, then resume an internal rollout.
5. If a migration must be reversed, create a new reviewed migration. Do not edit an
   applied migration or restore direct client mutation grants for privileged
   operations.

## Current External Blockers

- The linked Supabase project is a single environment; staging/production
  separation and CI promotion are not configured.
- Six controlled functions are deployed; all other functions remain off.
- A previously shared Supabase secret key must be rotated before activation.
- Custom SMTP, auth bot protection, and Apple/Google providers are not configured.
- No production AI endpoint/key/model.
- No configured Expo push delivery credential or scheduled notification worker.
- No configured account deletion or export-cleanup scheduler; only Storage cleanup
  is running.
- No native iOS/Android installation proof for secure storage and deep links.
- No two-device Supabase Realtime proof.
- Stripe, tax, moderation, shipping, legal, and support gates remain separate and
  incomplete for worldwide commerce.

Until those blockers are closed, keep global database flags off and limit Horse and
Records to the expiring named internal override.
