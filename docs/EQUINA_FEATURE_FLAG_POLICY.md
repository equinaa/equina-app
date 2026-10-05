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

## Server-only Flags

These have no compile-time switch: the database applies them, and the app reads
their effect rather than the flag.

| Flag | Default | What it does | Unlock requirement |
| --- | --- | --- | --- |
| `coach_credits` | off | Meters Ralf by the rider's monthly allowance | paywall copy and a store webhook that grants credits |
| `academy_progress` | off | Saves where a rider stopped in a lesson | real lessons to make progress through |
| `plans` | off | Applies each plan's limits: Academy picks and Club access (`docs/EQUINA_PLANS.md`) | riders can subscribe in the app; per-account overrides first, to try the Free experience |
| `public_access` | off | Opens Equina to everyone, past the beta door (below) | the launch; Admin → Beta |

## The Beta Door

Three layers, each answering one question:

1. **Feature flags:** is this feature ready to be live? Readiness, and the emergency off
   switch. Everything above.
2. **The beta door:** who is in the beta? An invite list by email (`public.beta_invites`),
   kept from Admin → Beta, and one flag, `public_access`, that opens Equina to everyone.
3. **Plans:** what does this rider get? `docs/EQUINA_PLANS.md`.

Before the door, every global flag stayed off at 0% and each tester was let in by five to
ten rows in `feature_flag_overrides`. Now the flags can be on globally for the beta, because
the door is enforced where every flag already is, in `private.feature_enabled`
(`202610060003_beta_access.sql`):

1. A live per-person override wins, as before, in both directions. Testers let in by
   overrides keep exactly what they have.
2. Otherwise an account without app access gets `false` for every key except
   `public_access` itself and `account_settings`.
3. Otherwise the global row and its rollout bucket, as before.

An account has app access (`private.has_app_access`) when an invite that was not revoked
matches its email, case-insensitively, **and** the account has confirmed that email, so
nobody gets in by signing up with someone else's invited address. Or when
`public_access` is on for it: its global rollout at launch, or a per-person override
that lets one account in without an invite.

`account_settings` is exempt so every account holder can export and delete their own data
while waiting outside. Content that was never behind a flag is closed separately: the
Academy's playback and picks (`PT403`, which `academy-playback` answers with 403
`beta_only`), the Club's posts, comments, reactions, media, spaces and memberships, other
riders' profiles and avatars. A rider's own basics stay reachable.

The app reads the door as `capabilities.appAccess` (from `my_access()`). A signed-in account
without it sees the beta door screen instead of onboarding and the app: the account is
saved, it can check again, sign out or schedule its deletion. Equina emails nobody about an
invite, and the screen does not say it will. Capabilities are read again when the app
returns to the foreground, at most once a minute.

**Inviting someone.** Admin → Beta → Invite a rider: the email they sign up with and an
optional staff note. They are inside as soon as their account exists with that email
confirmed. Tell them yourself. Revoke puts them back outside (the account stays); Invite
again clears the revoke. Sign in with Apple can hide the address behind a relay, which then
needs its own invite.

Testers let in by overrides before the door need an invite too: their overrides still work
on the server, but the app shows the door to any account without app access. Invite them
before the new app and Edge Functions go live. `scripts/grant-tester.sh` still grants its
five overrides by hand, and now invites the account's email as well.

**Opening at launch.** Admin → Beta → Open at launch, after ticking "I understand everyone
who signs up gets in". This sets `public_access` on at 100%. Closing it again is the same
control in reverse. A gradual opening is the flag's rollout percent, set on the flag itself;
the admin shows it.

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

Since the beta door, these steps turn flags on globally for the beta rather than per
person; only invited accounts feel them until `public_access` opens.

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
