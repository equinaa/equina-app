# Equina Backend Security Model

Updated for Sprint 4. This is the intended security contract for the additive
Supabase migrations and Edge Functions in this repository. Local PGlite tests prove
database policy behavior, but do not prove that a remote Supabase project or an AI,
push, payment, tax, or moderation provider has been configured.

## Trust Boundaries

1. The Expo client is untrusted. It may contain only the Supabase URL and
   publishable key, the Stripe publishable key, and compile-time emergency-off
   switches.
2. Supabase Auth establishes identity. Native sessions use chunked
   `expo-secure-store`; web uses Supabase browser storage and requires HTTPS outside
   localhost.
3. Postgres RLS and restricted grants are the authorization boundary for direct
   Data API access. A modified client flag never grants access.
4. Privileged Edge Functions re-verify the bearer token, re-check ownership and
   rollout, validate bounded input, and use the service role only for the operation
   that needs it.
5. Ralf's system instructions, provider key, model metadata, usage events, and
   safety review data remain server-side. Rider, listing, and lesson text is
   untrusted content, never trusted instruction.
6. Expo Push, the AI provider, Stripe, tax, and moderation adapters are external
   processors. Payloads are minimized before leaving Equina.

Edge error logs contain a request-safe error class/code only. Tokens, OTPs,
authorization headers, complete provider errors, message bodies, prompts, horse
health notes, and email addresses must not enter logs or analytics.

## Data Classification

| Class | Examples | Access |
| --- | --- | --- |
| Public catalogue | Active listings, approved photos, verified reviews | Public read; seller/server controlled write |
| Authenticated identity | Display name, avatar, discipline, level | Signed-in profile read; owner update |
| Private account | Personalization, notification choices, export requests, deletion state | Owner read; owner or authorized Edge mutation |
| Private relationship | Horse records, Ralf history, buyer-seller conversations | Horse owner/collaborator, Ralf owner, or conversation participants |
| Restricted commerce | Addresses, orders, disputes, evidence, payout state | Buyer, seller, and authorized operations staff |
| Credential material | Native session chunks, Expo push token | Device secure storage or service-only database access |
| Server only | Ralf operations/safety/usage, notification outbox, audit events, Stripe events, rollout control | Edge Functions/service role or authorized staff tooling |

## Sprint 4 Authorization Matrix

| Resource | Authenticated client | Edge/service role | Isolation rule |
| --- | --- | --- | --- |
| `user_preferences` | own row read; own insert/update only while `account_settings` is enabled | lifecycle administration | `user_id = auth.uid()` |
| `notification_preferences` | own row read; own insert/update only while enabled | delivery enforcement | `user_id = auth.uid()` |
| `push_devices` | no direct read or mutation | register, rotate, revoke, invalid-token cleanup | token ownership checked in Edge Function |
| `notification_outbox` | no access | enqueue, claim, suppress, retry, deliver | recipient and category evaluated server-side |
| `data_export_requests` | own request status read | create export, private upload, signed URL | `user_id = auth.uid()` |
| `account_audit_events` | no access | append operational events | no message, token, OTP, email, or health content |
| `account_deletion_requests` | own status read only | schedule/cancel/process | scheduling and its audit event cannot be bypassed through Data API; open to every account (App Store 5.1.1(v)), not behind a rollout flag |
| `coach_conversations` | own rows read; owned RPCs create/update/archive/delete | provider workflow | owner only; selected horse must be viewable |
| `coach_messages` | own conversation read only | user/assistant pair insertion | clients cannot forge roles or safety metadata |
| `coach_message_feedback` | feedback on own assistant messages | moderation access | assistant message must belong to owner |
| `coach_message_operations` | no access | provider telemetry only | never exposed to client |
| `coach_safety_events` | no access | append/review | redacted reason only |
| `coach_usage_events` | no access | idempotency and rate limits | per authenticated user |
| marketplace conversations/messages | participants read/send under existing policy | moderation and notification operations | third users cannot read; blocking prevents send |
| media objects and registration rows | domain-authorized read; no direct client write | signed ticket, validation, registration, cleanup | parent, owner, path, type, size, and content checks run server-side |

Marketplace conversations are encrypted in transit and protected by participant
RLS, but are server-readable for fraud, abuse moderation, support, and legal
obligations. Equina does not claim end-to-end encryption, online presence, typing
state, or guaranteed delivery.

## Security Controls

- Every public application table has RLS enabled; new sensitive tables start with no
  authenticated policy.
- `complete_equina_onboarding` is idempotent: retries reuse the primary horse and do
  not duplicate the completion audit event.
- Account deletion scheduling and cancellation run through Edge Functions. Direct
  authenticated insert/update grants are revoked.
- Ralf accepts a conversation ID, bounded text, UUID nonce, and context intent. It
  derives identity and allowed context server-side.
- Ralf has 6,000-character input/output bounds, a 15-second provider timeout,
  8-request/minute and 60-request/day database limits, typed failures, and a unique
  `(conversation_id, client_nonce, role)` contract.
- Confidence is derived from permitted structured context coverage. Provider prose
  cannot set confidence or invent `basedOn` sources.
- Health, lameness, injury, colic, medication, and acute welfare prompts use a
  deterministic safety escalation before provider output is shown.
- Human messages retain the existing participant-only RLS, trimmed length checks,
  stable sender nonce, block enforcement, rate limit, archive/read state, and
  Realtime publication.
- Marketplace message outbox payloads contain only conversation/listing identifiers
  and a bounded listing title. The message body is never copied into the outbox or
  push payload.
- Notification delivery rechecks current category preferences and quiet hours,
  deduplicates, retries with bounded exponential backoff, dead-letters after six
  attempts, and revokes provider-invalid tokens.
- Private exports are written to the `account-exports` bucket, returned through a
  15-minute signed URL, and marked with a 24-hour expiry.
- Authenticated clients have no direct Storage mutation policy. Uploads use a
  short-lived server-created ticket and signed URL, then `complete-upload` verifies
  object metadata, file signature, and sensitive-file hashes before a service-role
  registration. Avatar, horse photo, onboarding completion, and media registration
  columns are server-owned.
- Checkout reservation, payment transitions, upload completion, moderation, and
  cleanup remain server-owned from previous sprints.
- Riders see each other by name and photo only. Authenticated clients hold SELECT
  on `profiles(id, display_name, avatar_path)` and nothing else, so another rider's
  location, bio, discipline and level are unreadable; a rider reads their own full
  profile through `my_profile()`. Signed-out visitors read no profile (202610050002).
- Staff powers require a second factor. `private.is_staff()` and the admin feature
  flag policy hold only for a session whose JWT carries `aal: aal2`, so a leaked
  staff password alone opens nothing (202610050001). The admin console uses the
  publishable key and the staff member's session; it never holds the service role.
- Edge functions that act for staff with the service role (`requireStaff`) read
  the second factor from the session token, so the rule holds outside the
  database too.
- Lesson videos are Mux assets with signed playback only. Uploads open only
  after `staff_prepare_lesson_video` accepts the staff session for a draft;
  `mux-webhook` reads nothing without a valid `Mux-Signature` (five-minute
  tolerance) and changes only the row waiting for that upload.
- Lesson publication, chapter sets, and Club moderation decisions go through
  `staff_*` security-definer functions that check `is_staff()` first. A lesson's
  `published_at` has no client grant, and only drafts can be deleted, so riders'
  progress on a published lesson is never deleted with it.

## Retention Contract

These are product-policy defaults and require privacy/legal approval before launch:

| Data | Default lifecycle |
| --- | --- |
| Human marketplace messages | retained while the account/order relationship is active; a sender deletion becomes a tombstone so the conversation and fraud trail remain coherent |
| Ralf messages | retained until the rider deletes a conversation/history or account deletion becomes effective |
| Ralf operations and usage | operational metadata only; target 30 days, then aggregate/delete |
| Ralf safety events | redacted review record; target 24 months for safety quality and audit |
| Push devices | until sign-out, provider invalidation, explicit revoke, or account deletion |
| Notification outbox | delivered/suppressed rows 30 days; dead letters 90 days for operations review |
| Account exports | signed link 15 minutes; export object/request expires after 24 hours and `process-data-export-cleanup` removes it through the retryable storage queue |
| Auth logs | provider-controlled retention configured in Supabase; never copied into product analytics |
| Legal marketplace records | restricted retention target 7 years where required for payments, disputes, tax, or fraud; access limited and reviewed by counsel |
| Account audit events | minimum necessary event metadata; target 24 months except events tied to legal retention |

When deletion becomes effective, Equina revokes push state, removes Ralf history,
preferences, horses, horse records, private export files, and Club media; tombstones
Club and sent marketplace text; anonymizes the profile; and soft-deletes the Auth
identity. Storage removal is retryable. Orders, disputes, payment, fraud, and other
legally required marketplace records remain restricted rather than silently
disappearing.

## Threat-Test Evidence

`tests/backend-migrations.test.ts` executes every migration in isolated Postgres
through PGlite with anonymous, authenticated, service, and three distinct rider
identities. It covers default-off rollout, preference isolation, direct deletion
bypass denial, direct media/upload bypass denial, server-owned path enforcement,
horse-context authorization, forged assistant denial, provider metadata denial,
nonce idempotency, AI rate limits, third-user chat isolation, message notification
redaction/suppression, push-token denial, and blocked messaging.

This is strong database evidence, not a substitute for staging. Supabase Realtime
subscription authorization, provider timeouts over the network, native keychain
restore, push receipts, and two physical-device messaging still require the
deployment checks in the runbook.

## Deliberate Non-Claims

Equina does not store card details, diagnose horses, analyze unseen video or sensor
data, guarantee tack fit, provide legal escrow, or offer end-to-end encrypted chat.
Stripe is the payment processor. Worldwide payment, tax, privacy, support, and legal
retention obligations require named operational owners before transaction rollout.
