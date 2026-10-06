# Equina Technical Design

Design date: 2026-08-25
Applies to: `Equina 2.0 - copie` working tree, Supabase project `mvdxohyayriywbcknulg` (Frankfurt)
Verified on 2026-08-25: `npm test` and `npm run typecheck` both pass.

This document describes the system as it is actually built, names the two structural problems in it, and defines the target architecture. It is a design record, not a tutorial — it assumes the reader has `docs/EQUINA_BACKEND_AUDIT_2026-07-29.md` and `docs/EQUINA_BACKEND_DEPLOYMENT_INVENTORY.md` available.

## 1. Goals And Constraints

### Design Goals

1. **Fail closed.** A capability is unavailable unless every layer independently confirms it is safe. No single switch can turn on a product surface.
2. **No fake success.** The client may show a read-only route for a disabled mutation, but never a success state for something that did not persist.
3. **Server-owned truth.** Security-relevant fields — media paths, completion timestamps, moderation status, payment state — are written by the server, never by the client.
4. **Additive migrations only.** An applied migration is never edited or removed; corrections ship forward.
5. **Provider-agnostic boundaries.** AI, malware scanning, payments, email, and moderation sit behind adapters so a provider can be swapped without touching product code.

### Constraints

- Single codebase targeting iOS, Android, and web via Expo SDK 55 / React Native 0.83 / React 19.
- EU data residency (Frankfurt).
- One hosted environment today; staging is required but not provisioned.
- Client bundles may contain publishable keys only — enforced by `npm run security:bundle-scan`.

## 2. System Overview

```
┌──────────────────────────────────────────────────────────────────┐
│  CLIENT  (Expo / React Native — iOS, Android, Web)               │
│                                                                  │
│  src/App.tsx ── root shell, tab routing, 76 view components      │
│      │                                                           │
│      ├── src/features/*      feature screens + hooks             │
│      ├── src/ui/*            theme, primitives, motion, states   │
│      ├── src/config/         compile-time feature flags          │
│      ├── src/product/        product-truth rules (fit screening) │
│      │                                                           │
│      ├── src/backend/*   ◄── REAL stack (Supabase repositories)  │
│      └── src/api + services ◄── PROTOTYPE stack (in-memory)      │
└───────────────────┬──────────────────────────────────────────────┘
                    │  HTTPS · PKCE · publishable key only
┌───────────────────▼──────────────────────────────────────────────┐
│  SUPABASE (Frankfurt)                                            │
│                                                                  │
│  Auth ── email/password, OTP, recovery, PKCE, secure change      │
│                                                                  │
│  Postgres ── 34 additive migrations, RLS on every public table   │
│      ├── app_feature_flags + named-user overrides                │
│      ├── worker job tables with claims + lease tokens            │
│      └── server-owned media / completion / payment columns       │
│                                                                  │
│  Storage ── private buckets; no direct authenticated writes      │
│                                                                  │
│  Edge Functions (Deno) ── 29 implemented, 6 deployed             │
│      └── _shared/: http, supabase, automation, media-safety,     │
│                    order-payments, storage-cleanup, stripe       │
│                                                                  │
│  pg_cron + pg_net ── 5 schedulers designed, 1 active             │
└───────────────────┬──────────────────────────────────────────────┘
                    │  Edge-only, secrets in Vault / Function env
┌───────────────────▼──────────────────────────────────────────────┐
│  EXTERNAL PROVIDERS — all behind adapters, none configured       │
│  SMTP · AI · Malware scan · Moderation · Stripe · Sentry · Push  │
└──────────────────────────────────────────────────────────────────┘
```

## 3. The Three-Layer Activation Gate

This is the most important design decision in the system and the reason its risk posture is defensible. A capability is live only when:

```
compile-time failsafe  AND  authenticated backend capability  AND  screen precondition
```

### Layer 1 — Compile-time failsafe

`src/config/feature-flags.ts` reads `EXPO_PUBLIC_ENABLE_*` environment variables at build time. Three flags are hardcoded `false` in source (`clubPublishing`, `clubInteractions`, `shopTransactions`, `shopListingCreation`) and cannot be enabled by configuration alone. Each flag carries a `featureFlagReason` string used verbatim in disabled-state copy, so the UI explains the boundary instead of hiding it.

This layer is an emergency off switch. It exists so a bad database rollout cannot activate a surface in a build that was never tested for it.

### Layer 2 — Authenticated backend capability

`supabase/functions/backend-capabilities/index.ts` returns a per-session capability object. Its design has two properties worth preserving:

**Per-session flag resolution.** The function attempts `requireUser(request)`, then resolves `featureFlagsForSession(token)` — which applies global flags, rollout percentage, and named-user overrides. A 401 is caught and downgraded to an empty flag set rather than an error, so the unauthenticated response is a valid fail-closed object rather than a failure.

**Fail-closed provider conjunction.** A database flag is never sufficient on its own. Each capability ANDs the flag with a check that the provider secrets actually exist in the Edge environment:

| Capability | Database flag | AND provider check |
| --- | --- | --- |
| `accountSettings` | `account_settings` | `ACCOUNT_AUTOMATION_SECRET` |
| `coachChat` | `coach_chat` | AI URL + key + model, or an explicit localhost-only dev fallback |
| `pushNotifications` | `push_notifications` | `NOTIFICATION_AUTOMATION_SECRET` |
| `clubPublishing` | `club_publishing` | moderation URL + token + automation secret |
| `listingCreation` | `shop_listing_creation` | moderation URL + token + automation secret |
| `checkout` | `shop_transactions` | Stripe key + webhook secret + terms version + Connect return/refresh URLs |
| `records` / `horseManagement` / `rideLogging` / `clubInteractions` / `messaging` | flag only | — |

The consequence: turning on a database flag for a capability whose provider is unconfigured changes nothing. This is why the current remote response returns `auth: true` and eleven `false` values despite substantial deployed code.

The dev fallback for `coachChat` is deliberately constrained to `SUPABASE_URL` containing `127.0.0.1` or `localhost`, so it cannot activate against a hosted project.

### Layer 3 — Screen precondition

The screen itself checks its own requirements at action time: an active session, a selected horse, a non-empty prompt, an active participant relationship, a granted OS permission. This is where `docs/EQUINA_EXPERIENCE_STATE_CONTRACT.md` applies — loading, empty, error, offline, and permission-denied must all be implemented before the flag may move.

## 4. Client Architecture

### 4.1 Layers

| Layer | Location | Responsibility |
| --- | --- | --- |
| Shell | `src/App.tsx` | Tab routing, screen composition, prototype state |
| Features | `src/features/{account,coach,messaging,notifications,onboarding,records,ride}` | Screens plus their controller hooks |
| UI system | `src/ui/{theme,primitives,motion,layout,states,conversation,settings}` | Tokens, primitives, haptics, reduced-motion, state copy |
| Product rules | `src/product/product-truth.ts` | Truth-constrained derivations (qualitative fit screening) |
| Backend | `src/backend/*` | Supabase repositories, edge client, session storage |
| Prototype | `src/api/`, `src/services/`, `src/seed/` | In-memory store used for seeded demo surfaces |
| Domain | `src/domain/types.ts` | Shared entity types |

Feature controllers follow a consistent shape: `useAccount`, `useHorseRecords`, `useCoachConversation`, `useShopConversation`, `useEquinaSession`, `usePushRegistration`. Each owns loading/error/optimistic state for its domain and calls the matching repository. This is the healthy part of the client and the pattern the rest should converge on.

### 4.2 Backend Client Layer

`EquinaBackend` (`src/backend/equina-backend.ts`) is a lazily-constructed singleton composing seven repositories plus an `EdgeClient` over one Supabase client. Its `connect()` resolves session and capabilities in parallel — one round trip to establish both identity and what the app is allowed to do.

`getSupabaseClient()` configures PKCE flow, `processLock` for concurrent refresh safety, `detectSessionInUrl: false`, and platform-conditional storage. On native it binds an `AppState` listener that starts and stops auto-refresh with foreground state, avoiding background token churn.

`EdgeClient.invoke()` attaches a per-call `x-request-id` UUID, giving every Edge invocation a correlation ID that survives into redacted server logs.

`EquinaBackendError` carries `code` and a `retryable` flag derived from HTTP status — status 0 or ≥500 is retryable, 4xx is not. This is what lets controllers distinguish "retry this" from "fix your input" without parsing prose.

### 4.3 Native Session Storage

Supabase sessions exceed `expo-secure-store`'s per-item limit, so `chunked-session-storage.ts` splits them across keys with a manifest. The design is generation-safe:

1. Write every chunk of a **new generation** under new keys.
2. Atomically swap the manifest to point at the new generation.
3. Only then remove the previous generation.

Per-key mutations are serialized, legacy manifests migrate in place, and a failure-injection test proves a partial write preserves the previous session without leaking new chunks. Keychain accessibility is `WHEN_UNLOCKED_THIS_DEVICE_ONLY` — sessions do not migrate to a new device via backup.

**Open gate:** physical iOS and Android process-kill proof has not been run. The isolated test proves the algorithm; it does not prove Keychain behaviour under real app termination.

## 5. Backend Architecture

### 5.1 Database

34 additive migrations spanning `202607210001_core` through `202607290005_data_export_cleanup_leases`, organized by domain: core, records, club, marketplace, storage/realtime security, operations, safety, collaboration, rollout/checkout hardening, moderation, notifications, account deletion, onboarding, media boundary, internal rollout, and worker leases.

Every public table has RLS and a primary key. `npm run backend:audit` fails the build on nine regression classes:

- public tables without RLS or primary keys;
- anonymous mutation grants;
- authenticated media registration grants;
- direct authenticated Storage write policies;
- client access to server-owned media/completion columns;
- unsafe `security definer` search paths;
- unexpected anonymous `security definer` execution;
- unindexed foreign keys.

This guardrail is the reason the security posture is likely to survive future changes. It should be wired into CI as a required check the moment CI exists.

### 5.2 The Media Boundary

The most consequential security design in the system. Migration `202607290001` closed a P0 where authenticated clients could write directly to Storage and insert media registration rows, bypassing every check.

The only valid path is now:

```
create-upload-ticket  ──► client receives a signed, scoped, expiring upload target
        │
   client uploads directly to private Storage
        │
complete-upload  ──► verifies owner/editor, ticket expiry, bucket/path ownership,
                     declared size, declared MIME, magic bytes, SHA-256 content hash
        │
   malware scanner adapter (short-lived signed URL, MIME, size, hash)
        │
   verdict "clean" ──► create active media reference
   verdict "malicious" ──► reject, queue for private Storage cleanup
```

Direct writes to `horse_record_files`, `club_post_media`, `listing_photos`, and `dispute_evidence` are revoked. Profile avatar, onboarding completion, and horse photo paths are server-owned, and the onboarding RPC cannot set an arbitrary horse photo path.

`MALWARE_SCAN_REQUIRED=true` makes provider failure fail closed. The scanner is not yet contracted.

**Known gap:** EXIF stripping, image normalization, and video transcoding are not implemented. The required processor contract is specified in `docs/EQUINA_MEDIA_PROCESSING_BOUNDARY.md` — claim with lease token, download via service signed URL, decode and re-encode, strip all metadata, enforce dimensions, recompute MIME/size/hash, write to a new immutable path, atomically replace the active reference, queue the source for cleanup, complete under the same lease token. Until it exists, public media publishing stays disabled and image upload is approved for named internal users only. The Club composer's "Add photo" control is built but hidden behind the client flag `EXPO_PUBLIC_ENABLE_CLUB_PHOTO_POSTS` (default off); the server gates `club_post` tickets on `club_publishing` alone, so the client flag is the only thing standing between a HEIC with GPS and every Club reader.

### 5.3 Edge Functions

29 implemented, 6 deployed. `supabase/functions/_shared/` provides the common surface: `http.ts` (request IDs, typed `HttpError`, CORS preflight, method enforcement, redacted error responses), `supabase.ts` (`requireUser`, `featureFlagsForSession`), `automation.ts` (worker secret verification), `media-safety.ts`, `order-payments.ts`, `storage-cleanup.ts`, `stripe.ts`.

Deployed today:

| Function | Ver | JWT | Purpose |
| --- | ---: | --- | --- |
| `backend-capabilities` | 6 | no | Per-session capability resolution |
| `create-upload-ticket` | 2 | yes | Issue scoped signed upload target |
| `complete-upload` | 3 | yes | Verify and register media |
| `delete-upload-asset` | 2 | yes | Remove media through the boundary |
| `delete-horse-record` | 2 | yes | Server-authorized record deletion |
| `process-storage-cleanup` | 2 | no | Scheduled orphan cleanup |

Undeployed and remote-disabled: all Club, messaging, notification, account deletion/export, Ralf, moderation, seller, tax, Stripe, dispute, payout, and order-worker functions.

Worker secret comparison is centralized through SHA-256 digest comparison, and moderation and Storage cleanup now hold **separate** secrets rather than reusing the order automation credential. This blast-radius separation is correct; the corresponding secrets must exist before those functions are deployed.

### 5.4 Async Work Model

Five workers share one durable pattern:

1. **Atomic claim** — a database-level claim prevents two workers taking the same job.
2. **Lease token** — the worker holds a token; a stale worker whose lease expired cannot publish its result.
3. **Attempt counting and bounded retry** — failures are counted, not retried forever.
4. **Stale recovery** — expired leases return jobs to the queue.
5. **Dead-letter** — exhausted jobs are preserved, not dropped.

Proven in the isolated Postgres suite for worker concurrency, stale-lease recovery, and stale-token rejection.

| Worker | Implemented | Deployed | Scheduled |
| --- | --- | --- | --- |
| Storage cleanup | yes | yes | `*/5 * * * *` |
| Content moderation | yes | no | no |
| Notification outbox | yes | no | no |
| Account deletion | yes | no | no |
| Data export cleanup | yes | no | no |

Two designs still need changing before their capabilities activate: `request-data-export` is **synchronous and unpaginated**, and order deadline processing must be redesigned around durable, idempotent provider operations before checkout can be considered.

### 5.5 Secret Isolation

| Secret class | Location | Never in |
| --- | --- | --- |
| Publishable Supabase key | Expo/Vercel client env | — |
| Supabase secret key | Supabase dashboard only | Client, docs, chat, git |
| Worker automation secrets | Edge Function env + Vault | Client, docs, git |
| Provider secrets (AI, scanner, Stripe, SMTP) | Edge Function env / provider console | `EXPO_PUBLIC_*`, logs, docs |
| Apple/Google client secrets | Provider console + Supabase Auth | `EXPO_PUBLIC_*` |

`npm run security:bundle-scan` inspects exported web artifacts for server-secret markers and currently reports zero. **Outstanding:** one Supabase secret key was pasted into a prior development conversation and must be treated as compromised until rotated.

## 6. Structural Problem 1: The Dual Data Stack

Two complete data stacks coexist inside the same running component.

`src/App.tsx:901` calls `createSeededEquinaApi()`, which builds `createEquinaApi()` from `src/api/equina-api.ts` — an in-memory `EquinaStore` with `AuthService`, `ProfileService`, `ListingService`, `OrderService`, `CommunityService`, and a `DeterministicAiProvider`. The same file imports `EquinaBackend` for the real Supabase path.

The result is a screen-by-screen split with no enforced boundary:

| Surface | Stack |
| --- | --- |
| Account, Auth, Coach, Records, Horse, Shop messaging | Real (`src/backend/*`) |
| Home, Ride, Academy, Club, Shop browse/checkout/orders/saved, Seller | Prototype (in-memory seed) |

This is a reasonable transitional state — it is how the product stayed demonstrable while the backend was built — but it carries three real costs. It is the direct cause of the "reload resets" behaviour catalogued in the action registry. It means `tests/core-flows.test.ts` exercises the prototype stack, so passing tests say less about production behaviour than they appear to. And it makes every future activation a migration rather than a flag change, because the screen must be rewritten, not just unlocked.

**Target.** Each surface migrates to a feature controller hook over a repository, matching `useHorseRecords` / `useAccount`. The prototype stack shrinks to seeded fixtures for tests and screenshots only, and `src/api/equina-api.ts` plus `src/services/*` are deleted once no screen imports them. The migration order from the backend audit still holds: Horse CRUD → Records without files → private record files → Club text → Club media → marketplace browse → listing drafts → messaging → checkout.

## 7. Structural Problem 2: The App.tsx Monolith

`src/App.tsx` is **15,971 lines** — 54% of the 29,567-line `src` tree. It contains **76 component functions**, **76 `useState` calls**, and a single `StyleSheet.create` block starting at line 6,902 that runs for roughly 9,000 lines.

Concretely this means: every screen's state lives in one component's scope; a change to a Shop card can trigger a re-render decision affecting Home; the style sheet cannot be reasoned about per screen; two people cannot work on different tabs without conflicting; and the file is large enough to degrade editor and type-checker responsiveness.

The `src/features/*` and `src/ui/*` directories show the intended structure — `OnboardingScreen`, `AccountScreen`, `RideExperience`, `CoachScreen`, `HorseRecordSheets`, `ShopConversationScreen` have already been extracted. The work is half done and stalled.

**Target decomposition:**

```
src/app/            root shell, providers, tab router  (< 400 lines)
src/features/home/       HomeScreen + useHome
src/features/stable/     StableScreen + sections
src/features/academy/    AcademyScreen, library, video, lesson
src/features/club/       CommunityScreen + useClub
src/features/shop/       buyer + seller routes + useShop
src/ui/styles/           per-feature style modules
```

Every remaining component in `App.tsx` moves next to the feature it serves, with its styles. This is mechanical, low-risk, and should be done **incrementally alongside** each backend-wiring task — extracting a screen at the moment it migrates from prototype to repository, rather than as a separate refactor sprint.

**Prerequisite:** this work must not begin until the repository is under version control (see `EQUINA_IMPACT_ASSESSMENT.md` §3). A 16,000-line file split with one commit as the only baseline is unrecoverable if it goes wrong.

## 8. Environments And Deployment

| Environment | Supabase | Client flags | Data | Status |
| --- | --- | --- | --- | --- |
| Local | Local CLI, or linked project for explicit remote tests | Demo off; only the target capability on | Synthetic only | Working |
| Staging | Separate project | Internal distribution, named users | Synthetic + consented QA | **Not provisioned** |
| Production | Existing project, post-promotion | Default off, gradual overrides | Real users | Serving both roles |

Promotion must be migration-by-migration and function-by-function. Database passwords, service keys, automation secrets, provider secrets, and private Storage objects are never copied between environments.

Web client: `https://equina-ten.vercel.app`, deployment `dpl_HkDJ3uWi5J3E3JqHPDLx5GDkVxHa`, publishable configuration only, Horse/Records compile switches on, all other privileged switches off, demo fallback off.

Native: EAS remote environment **could not be inspected** — the local CLI has no authenticated Expo account. Local `eas.json` and `app.json` contain no credential values, but remote EAS variables remain an explicit audit blocker.

### Emergency Rollback

1. Disable the client compile-time switch and clear the named database override.
2. Stop the matching cron job or provider traffic.
3. Preserve rows and cleanup queues; never edit or remove an applied migration.
4. For an upload incident, remove `complete-upload` only after flags are disabled.
5. Rotate the affected server secret and inspect redacted logs by request ID.
6. Ship an additive forward fix, rerun isolation tests and the bundle scan, then restore one named internal user before any wider rollout.

## 9. Test And Verification Strategy

| Layer | Command | Covers |
| --- | --- | --- |
| Core flows | `npm test` → `core-flows.test.ts` | Prototype-stack product rules, fit screening |
| Security contracts | `npm test` → `backend-contract.test.ts` | Capability shape, repository contracts |
| Migrations | `npm test` → `backend-migrations.test.ts` | Isolated Postgres (PGlite): rollout isolation, cross-user horse isolation, viewer/editor rules, blocked media registration, worker concurrency, stale-lease recovery, stale-token rejection |
| Types | `npm run typecheck` | Whole tree |
| Deno | `npm run backend:check` | All 29 Edge Functions |
| Schema guardrail | `npm run backend:audit` | Nine RLS/grant/index regression classes |
| Bundle secrets | `npm run security:bundle-scan` | Exported web artifacts |
| Visual | `tests/visual/*.mjs` (Playwright) | Onboarding, sprint smoke, polish audits |

**What this does not prove.** PGlite cannot prove hosted authenticated A/B/C isolation, Auth email delivery, Realtime behaviour, provider integrations, or physical-device behaviour. Those are mandatory staging gates and are listed as such in the backlog. Note also that `core-flows.test.ts` runs against the prototype stack, so its green result is not evidence about production data paths.

**Not yet run:** real email delivery, authenticated Horse→Record→upload→restart on hosted accounts, Rider A/B/C hosted isolation, physical iOS/Android session restore, two-device Realtime/offline/reconnect, Apple or Google provider sign-in.

## 10. Observability Design

Implemented: per-request UUIDs from `EdgeClient` through `_shared/http.ts`, stable redacted error responses, typed `HttpError` with status-derived retryability, and an optional **server-only** Sentry boundary.

Not provisioned: Sentry project, dashboards, alert routing. Required alert classes:

1. Auth delivery and callback failures
2. Edge 4xx/5xx rate and latency
3. Moderation backlog and job failures
4. Upload ticket mismatch and cleanup backlog
5. Notification dead letters
6. Account deletion and export failures
7. Stripe webhook retries, payment-state drift, transfer failures
8. Ralf provider errors and unresolved safety events

Privacy constraint: health records, message bodies, and payment state never enter analytics or error payloads. Push previews carry only `New message about [listing]` plus a route and conversation ID.

## 11. Known Technical Debt

| # | Item | Severity | Notes |
| --- | --- | --- | --- |
| T1 | Repository not under version control | **Critical** | 85 supabase files untracked; see impact assessment §3 |
| T2 | Dual data stack | High | §6 |
| T3 | `App.tsx` at 15,971 lines | High | §7 |
| T4 | `request-data-export` synchronous and unpaginated | High | Must become an async paginated job |
| T5 | Broad profile reads including location | High | Needs a public projection or RPC |
| T6 | No EXIF/normalization worker | High | Blocks all public media |
| T7 | Order deadline processing not idempotent-durable | High | Blocks checkout |
| T8 | 26 transitive dependency findings (18 high) | Medium | Expo/RN build tooling; never `audit fix --force` |
| T9 | 4 of 5 workers undeployed | Medium | Deploy one at a time with secrets and schedules |
| T10 | No CI | Medium | `backend:audit`, `typecheck`, `test`, `bundle-scan` should gate merges |

## 12. Decision Log

| # | Decision | Rationale | Consequence |
| --- | --- | --- | --- |
| D1 | Supabase over a custom backend | RLS as the primary authorization boundary; managed Auth/Storage/Edge; EU residency | Postgres policy correctness is the security model; `backend:audit` must guard it |
| D2 | Three-layer activation gate | No single actor can enable a surface | Activation is slower by design; flags alone cannot ship a feature |
| D3 | Capability endpoint ANDs flags with provider-secret presence | Prevents enabling a capability whose provider is absent | Provider config is a hard dependency of rollout |
| D4 | Additive migrations only | Preserves rollback and audit trail | Corrections ship forward; the migration count grows |
| D5 | Ticketed upload with server-side verification | Client cannot bypass MIME/size/hash/scan checks | Two round trips per upload |
| D6 | Claims plus lease tokens for all workers | Stale workers cannot publish | Every worker needs a job table and lease logic |
| D7 | Chunked generation-safe secure session storage | Supabase sessions exceed SecureStore item limits | Custom storage needs device-level proof |
| D8 | Protected payment with delayed transfer, not escrow | Escrow requires a licensed provider | Must never be marketed as escrow |
| D9 | AI as assistant with derived confidence | Model prose is not a confidence signal | Confidence comes from structured context coverage only |
| D10 | Seeded prototype stack retained during backend build | Kept the product demonstrable | Created D-debt T2; must be retired surface by surface |

## 13. Immediate Technical Priorities

1. **Commit and push everything to a private remote.** Nothing else in this document is safe to start first.
2. **Rotate the exposed Supabase secret key** and review access logs.
3. **Provision staging** and a CI promotion path; wire `typecheck`, `test`, `backend:check`, `backend:audit`, and `security:bundle-scan` as required checks.
4. **Configure custom SMTP**, SPF/DKIM/DMARC, templates, CAPTCHA, and leaked-password protection.
5. **Prove the activated vertical on hosted accounts** — Horse→Record→upload→restart, plus Rider A/B/C isolation, plus physical iOS/Android session restore.
6. **Then** begin the dual-stack migration and the `App.tsx` decomposition together, one surface at a time.

Related documents: `EQUINA_IMPACT_ASSESSMENT.md`, `EQUINA_SERVICE_DESIGN.md`, `EQUINA_BACKEND_SECURITY_MODEL.md`, `EQUINA_BACKEND_RUNBOOK.md`, `EQUINA_BACKEND_DEPLOYMENT_INVENTORY.md`, `EQUINA_MEDIA_PROCESSING_BOUNDARY.md`, `EQUINA_FEATURE_FLAG_POLICY.md`.
