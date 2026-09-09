# Equina Feature Flag Policy

Feature flags are product-truth boundaries, not launch marketing switches.

The client-safe defaults live in `src/config/feature-flags.ts`. Production rollout
values live in `public.app_feature_flags` and are exposed only through the
`backend-capabilities` Edge Function. Both layers default to `false` for flows that
imply authenticated persistence, moderation, money, secure files, or private
messaging.

## Current Flags

| Flag | Default | Unlock requirement |
| --- | --- | --- |
| `accountSettings` | false | verified auth restore, idempotent profile handoff, preference RLS, secure native session storage, export/deletion operations and worker QA |
| `coachChat` | false | authenticated provider boundary, consent enforcement, persisted history, output validation, health escalation, rate limits, and isolation QA |
| `pushNotifications` | false | authenticated device lifecycle, preference/quiet-hours enforcement, redacted payloads, retry, receipt cleanup, and deep-link QA |
| `clubPublishing` | false | auth, persisted posts, media, configured provider moderation, report/block, delete |
| `clubInteractions` | false | persisted identity, comments/reactions, optimistic rollback, abuse controls |
| `shopTransactions` | false | Stripe Connect, shipping/tax quotes, webhooks, idempotency, marketplace terms and legal review |
| `shopListingCreation` | false | seller verification, draft persistence, signed uploads, configured provider moderation |
| `shopMessaging` | false | authenticated threads, Realtime, unread state, retry, report/block/archive, notifications, participant-only RLS, and two-device QA |
| `recordMutations` | false | secure horse-record persistence and signed private uploads |
| `horseManagement` | false | authenticated horse CRUD, ownership authorization, archive/delete |

## Rules

1. Disabled capability copy must describe the boundary plainly.
2. Seed data remains visibly sample or preview data.
3. A disabled mutation may expose a read-only route, but not a fake success state.
4. Flags cannot be enabled only in UI code; service and server gates are required.
5. Tests must cover both disabled and enabled behavior before a production rollout.
6. Health records, messages, and payment state never enter analytics payloads.
7. A remote flag never overrides a missing client capability, authenticated session,
   provider secret, or legal gate.
8. `shopTransactions` describes protected payment with delayed seller transfer. It
   must never be marketed as legal escrow without a licensed escrow provider.
9. Activation is always `compile-time failsafe AND authenticated backend capability
   AND screen precondition`.
10. Account, Ralf, messaging, and push remain off when their worker/provider secrets
    are absent, even if a database rollout row is enabled.

## Sprint 4 Activation Order

1. Enable `account_settings` remotely for internal users only after the account
   deletion worker and export cleanup schedule are running.
2. Enable `coach_chat` only after the production provider is configured and health,
   malformed-output, timeout, and cross-user staging tests pass.
3. Enable `shop_messaging` only after two-device Realtime, unread, block/report, and
   draft/retry tests pass.
4. Enable `push_notifications` last, after Expo push delivery, invalid-token cleanup,
   quiet hours, redacted deep links, and sign-out revocation pass on iOS and Android.

Compile-time flags are emergency off switches. Database flags use zero-percent,
default-off seeds and stable per-user rollout. Neither layer may be changed to
production-on in source control merely to make a demo appear connected.
