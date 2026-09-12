# Equina Backend Audit

Audit date: 2026-07-29

> **Re-provisioning note (2026-09-09).** The environment this audit was run
> against (`vdcrllzyzbdjonotrujb`) was deleted. The backend was rebuilt on
> project `mvdxohyayriywbcknulg` (Frankfurt) from the same 34 migrations, and
> the web client moved from `equina-five.vercel.app` to
> `equina-ten.vercel.app`. Identifiers below were updated to the current
> environment; the findings and dates remain those of the original audit.

## Verdict

Equina now has an internally activated Horse/Records backend, but it is not yet a
production-ready backend. The verified foundation score is approximately 7.3/10
and hosted production readiness is approximately 5.9/10. Database security, the
first app vertical, controlled Edge deployment, and one scheduler are real;
provider configuration, staging separation, hosted multi-user proof, physical
devices, and alerting remain incomplete.

This distinction is important:

- **Implemented** means reviewed code and migrations exist in this repository.
- **Deployed** means the exact artifact is running in the linked Supabase project.
- **Configured** means every required provider secret, redirect, scheduler, and
  policy is present.
- **Proven** means the journey passed remote integration and physical-device tests.

No capability should be described as live until all four conditions are true.

## Current Remote State

| Boundary | Verified state |
| --- | --- |
| Supabase project | Linked to `mvdxohyayriywbcknulg`, Frankfurt |
| Database | All 34 local migrations applied remotely |
| Remote schema lint | No warnings or errors |
| Edge Functions | Six narrowly scoped functions deployed; see deployment inventory |
| Runtime secrets | Storage automation configured separately; other providers absent |
| Capability response | Auth true; all privileged product capabilities false |
| Internal rollout | One named user receives Horse and Records only |
| Production SMTP | Not configured |
| Apple / Google auth | Not configured for production |
| Stripe / tax / moderation / AI / push | Not configured |
| Schedulers | Storage cleanup runs every five minutes and returned HTTP 200 |

The current fail-closed capability response is correct. It prevents the UI from
claiming that account operations, Ralf, records, Club publishing, listing creation,
messaging, push, or checkout are live.

## Readiness Matrix

Scores measure end-to-end activation readiness, not code volume.

| Area | Readiness | Assessment |
| --- | ---: | --- |
| Database schema and RLS | 92% | Strong ownership, named overrides, private buckets, media grants, worker claims, and server-owned operations |
| Authentication | 62% | Password and recovery flows plus PKCE/session restore exist; SMTP, CAPTCHA, social providers, and native proof are absent |
| Edge Function implementation | 78% | 29 functions check locally; six approved boundaries are deployed and versioned |
| Account operations | 48% | Profile/preferences exist and export cleanup has leases; generation/deletion remain undeployed and export coverage is incomplete |
| Horse and records | 74% | Product screen, repository, private upload boundary, rollback states, and internal rollout are real; hosted restart proof remains |
| Club | 25% | Posts, comments, reactions, reports, moderation jobs, and RLS exist; UI is not wired and moderation is not configured |
| Ralf / Academy AI | 30% | Persisted conversations and safety boundary exist; no production AI provider or remote function |
| Marketplace browse | 48% | Public catalog reads are uncoupled from messaging and no longer use production seed fallback |
| Marketplace messaging | 35% | Participant RLS, blocking, reports, nonces, outbox, and Realtime exist; functions/flags and two-device proof are absent |
| Checkout and seller payout | 15% | Strong state-machine and webhook code exists; no Stripe Connect, tax, shipping, legal, or staging proof |
| Operations and observability | 54% | Request IDs, redacted errors, Sentry boundary, lease claims, and Storage cron exist; dashboards and alert routing are absent |

## Fixed During This Audit

### P0 Media Boundary

Authenticated clients could previously upload directly to Storage and insert media
registration rows. That bypassed upload tickets, MIME signature checks, size checks,
content hashes, duplicate-listing detection, and moderation queues.

Migration `202607290001_media_boundary_and_index_hardening.sql` now:

- removes every direct authenticated Storage write policy;
- revokes direct writes to `horse_record_files`, `club_post_media`,
  `listing_photos`, and `dispute_evidence`;
- makes profile avatar, onboarding completion, and horse photo paths server-owned;
- blocks the onboarding RPC from setting an arbitrary horse photo path;
- preserves signed upload through `create-upload-ticket` and `complete-upload`;
- adds all previously missing foreign-key indexes.

The migration is deployed remotely. Automated tests prove that direct bypasses fail.

### Audit Guardrail

`npm run backend:audit` now fails on:

- public tables without RLS or primary keys;
- anonymous mutation grants;
- authenticated media registration grants;
- direct authenticated Storage write policies;
- client access to server-owned media/completion columns;
- unsafe `security definer` search paths;
- unexpected anonymous `security definer` execution;
- unindexed foreign keys.

### Automation Credential Isolation

Worker secret comparison is centralized through SHA-256 digest comparison.
Moderation and Storage cleanup now require their own secrets instead of reusing the
order automation credential. These function changes are local and must be deployed
only after the corresponding secrets and schedules exist.

## Launch Blockers

### P0: Rotate The Exposed Secret Key

A Supabase secret key was pasted into a prior development conversation. Treat it as
compromised even though it is not present in tracked files. Rotate/revoke it in the
Supabase dashboard, verify the audit logs, and keep only publishable keys in Expo or
Vercel. A secret/service key bypasses RLS and must never be bundled into a client.

### P0: Production Authentication Delivery

The app currently uses a magic-link path, but the project has no custom SMTP.
Supabase's default mailer is for non-production use and restricts recipients.
Configure a transactional provider, SPF/DKIM/DMARC, branded templates, production
redirects, delivery monitoring, CAPTCHA/Turnstile, and auth rate limits.

Apple and Google buttons must remain disabled until provider credentials, consent
configuration, native entitlements, redirect URLs, and real-device tests pass.

### P0: Prove The Activated Vertical On Hosted Accounts

The Horse/Records upload and cleanup functions are deployed and enabled for one
named internal user. The remaining gate is a real authenticated Horse → Record →
private upload → app restart test plus Rider A/B/C hosted isolation. Until that
passes, do not expand the override.

## High-Priority Gaps

### P1: App-To-Backend Wiring

- Club uses mock API and local reactions instead of `ClubRepository`.
- Seller drafts, checkout, order views, and messaging still have mock/demo surfaces.
- Public marketplace reads are real, but production may currently be empty.
- Horse and Records are real only in a connected authenticated internal build.

The next backend activation sprint should wire one vertical journey at a time and
remove fake success states. Recommended order: Horse CRUD, Records without files,
private record files, Club text posting, Club media, marketplace browse, listing
drafts, messaging, then checkout.

### P1: Export Completeness And Scale

`request-data-export` is synchronous and relies on default query limits. It omits
parts of Club, media metadata, seller/listing/order/dispute/review/report history,
and operational preference data. Replace it with an asynchronous export job,
paginate every dataset, version the manifest, encrypt/store privately, and test an
account with more than 1,000 rows per domain.

### P1: Finish Worker Activation

Storage cleanup, moderation, notifications, account deletion, and export cleanup
have database claims, lease tokens, attempts, stale recovery, and bounded retry.
Only Storage cleanup is deployed and scheduled. Export generation remains
synchronous, and order deadline processing must be redesigned around durable,
idempotent provider operations before checkout.

### P1: Media Safety

Magic-byte checks, hashes, and a private scanner adapter boundary are present.
The scanner provider is not configured, and EXIF stripping, image normalization,
and video transcoding still require the documented processing worker. Public media
rollout remains disabled.

### P1: Observability

Request IDs, redacted structured errors, and an optional server-only Sentry
boundary exist. There is no configured Sentry project, operational dashboard, or
alert routing. Add metrics and alerts for:

- auth delivery and callback failures;
- Edge 4xx/5xx and latency;
- moderation backlog and failures;
- upload ticket mismatch and cleanup backlog;
- notification dead letters;
- account deletion/export failures;
- Stripe webhook retries, payment-state drift, and transfer failures;
- Ralf provider errors and unresolved safety events.

### P1: Profile Privacy

Every authenticated account can read all profiles, including location. Replace broad
profile reads with a public profile projection or RPC and explicit visibility
choices before worldwide Club rollout.

### Fixed: Native Session Reliability

Secure Store now writes a complete new generation before atomically swapping the
manifest, then removes the prior generation. Per-key mutations are serialized,
legacy manifests migrate in place, and a failure-injection test proves a partial
write preserves the previous session without leaking new chunks. Physical iOS and
Android process-kill proof is still required.

### P1: Worldwide Commerce

The payment design is protected payment with delayed seller transfer, not licensed
escrow. Before checkout, approve a country/currency matrix, Connect eligibility,
cross-border fund flows, seller KYC, tax/VAT/OSS responsibility, shipping/insurance,
returns, disputes, prohibited goods, legal terms, and support ownership. Keep
checkout disabled until this is signed off and staged.

## Dependency Risk

The production install audit reports 26 transitive findings: 18 high, 7 moderate,
and 1 low,
primarily through Expo/React Native build tooling. The suggested automated fix
requires breaking framework changes. Do not run `npm audit fix --force`. Track the
Expo-compatible upstream upgrades, pin CI, and reassess each Expo SDK release.

## Activation Sequence

1. Rotate the exposed Supabase secret and review access logs.
2. Configure custom SMTP, auth abuse protection, redirects, and Apple/Google
   providers; prove sign-up, restore, and recovery on iOS and Android.
3. Add staging/production separation and CI for migrations and individual Edge
   Functions.
4. Deploy and prove account + upload infrastructure with all product mutations off.
5. Wire and activate Horse/Records for internal users, including private media.
6. Wire and activate Club and marketplace messaging only after moderation,
   reporting, worker, and two-device tests pass.
7. Treat checkout as a separate regulated launch with Stripe, tax, shipping, legal,
   finance, and support sign-off.

## Verification Evidence

The following passed after Sprint 6 on 2026-07-29:

```text
npm test
npm run typecheck
npm run backend:check
npm run backend:audit
npx expo-doctor
npm run build
npm run security:bundle-scan
npx supabase db lint --linked --schema public
npx supabase db push --linked --dry-run
```

Remote negative tests prove anonymous direct Storage upload, direct media
registration, and private signed URL creation are denied. The Storage scheduler
returned HTTP 200. PGlite still does not prove hosted authenticated A/B/C isolation,
Auth delivery, Realtime, providers, or physical-device behavior; those remain
mandatory staging gates.
