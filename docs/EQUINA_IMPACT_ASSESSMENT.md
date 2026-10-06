# Equina Impact Assessment

Assessment date: 2026-08-25

> **Re-provisioning note (2026-09-09).** The environment assessed here
> (`vdcrllzyzbdjonotrujb`, `equina-five.vercel.app`) was deleted and rebuilt as
> `mvdxohyayriywbcknulg` / `equina-ten.vercel.app`. Identifiers below were
> updated to the current environment; the findings and dates remain those of
> the original assessment.
Assessed artifact: `Equina 2.0 - copie` working tree, Supabase project `mvdxohyayriywbcknulg` (Frankfurt), web client `https://equina-ten.vercel.app`
Assessment basis: repository inspection, `docs/EQUINA_BACKEND_AUDIT_2026-07-29.md`, `docs/EQUINA_BACKEND_DEPLOYMENT_INVENTORY.md`, `docs/EQUINA_ACTION_REGISTRY.md`, and a re-run of the automated suite on 2026-08-25.

## 1. Purpose And Scope

This assessment answers three questions before any further rollout decision:

1. What would actually change for users, the business, and operations if Equina moved from its current internal state toward staged production?
2. What harm is possible today, in the state the system is in right now?
3. What must be true before each capability may be turned on?

Scope covers the mobile/web client, the Supabase backend (database, RLS, Storage, Edge Functions, schedulers), the hosted web deployment, and the operating processes around them. It does not cover marketing, pricing execution, or App Store commercial terms.

### Assessment Vocabulary

The audit vocabulary is retained because impact depends on it:

- **Implemented** — reviewed code and migrations exist in the repository.
- **Deployed** — the exact artifact runs in the linked Supabase project.
- **Configured** — every required secret, redirect, scheduler, and policy is present.
- **Proven** — the journey passed remote integration and physical-device tests.

Impact is only realized when all four are true. Most of Equina is *implemented*; very little is *proven*.

## 2. Current State Summary

Verified on 2026-08-25 against the working tree:

| Dimension | State |
| --- | --- |
| Automated suite | `npm test` passes (core flows, backend security contracts, isolated Postgres migrations) |
| Type safety | `npm run typecheck` passes with no errors |
| Migrations | 34 additive migrations, all synchronized to the linked project |
| Edge Functions | 29 implemented; **6 deployed** (capabilities, 4 Horse/Records upload/delete boundaries, Storage cleanup) |
| Schedulers | 1 of 5 active (`equina-storage-cleanup`, every 5 minutes) |
| Capability response | `auth: true`; all 10 privileged product capabilities `false` |
| Live users | 1 named internal user, Horse + Records only, 30-day override |
| Backend foundation score | ~7.3/10 (from ~5.5/10 pre-Sprint 6) |
| Hosted production readiness | ~5.9/10 (from ~3.8/10 pre-Sprint 6) |
| Environments | 1 (production-linked). Staging **not provisioned** |
| Version control baseline | **1 commit, 28 files, dated 2026-06-01** |

The fail-closed capability posture is correct and is the main reason user-facing harm is currently near zero. The product cannot claim account operations, Ralf, Club publishing, listing creation, messaging, push, or checkout are live, because they are not.

## 3. Critical Finding: The Work Is Not Under Version Control

This is the highest-severity finding in this assessment and it is not in any prior document.

The repository contains exactly one commit — `95b943b chore: establish Equina mobile baseline`, dated 2026-06-01, tracking 28 files. Everything produced from Sprint 2 onward is **untracked or uncommitted**:

- the entire `supabase/` tree — **85 files**, including all 34 migrations and all 29 Edge Functions — is untracked;
- `src/backend/` (14 repository and session modules), `src/features/` (all six feature domains), `src/config/`, `src/product/`, and most of `src/ui/` are untracked;
- 21 of 23 documents in `docs/` are untracked;
- `scripts/` (the audit and secret-scan guardrails) is untracked;
- `src/App.tsx`, `src/seed/seed-data.ts`, `src/ui/theme/theme.ts`, and `tests/core-flows.test.ts` are modified and uncommitted.

Nothing in `.gitignore` excludes `supabase/`. The files were simply never added.

**Impact.** The deployed database schema, every security policy, the media boundary, and the entire Edge Function surface exist in exactly one place: this laptop's filesystem, plus a partial reflection in the linked Supabase project. There is no rollback baseline, no diff history for security-relevant changes, no review trail, and no recovery path if the disk fails or the directory is deleted. `docs/IOS_RELEASE_AUDIT.md` flagged "no stable rollback baseline" on 2026-07-21; the situation has not improved and has materially worsened because far more work now sits outside version control.

**Severity: Critical. Likelihood of eventual loss without action: High. Mitigation cost: under one hour.**

This must be resolved before any other item in this assessment. Commit the working tree (secrets excluded — `.env` and `.env.*` are already ignored, and `npm run security:bundle-scan` should be run first), push to a private remote, and only then continue.

## 4. User Impact

### 4.1 Who Is Affected

| Actor | Present exposure | Exposure at staged rollout |
| --- | --- | --- |
| Rider (primary) | 1 internal user with real Horse/Records persistence; everyone else sees labelled sample data | Daily journal, horse records, private documents, AI assistance |
| Coach | None; no coach role is activated | Rider collaboration, Q&A, annotations |
| Buyer | Read-only catalog browse | Payment, address, shipping, dispute exposure |
| Seller | Read-only sample dashboard | Identity/KYC, payout account, tax status |
| Moderator | **Role has backend support but no staffed process** | Reviews reported content under deadline |
| Support | **No defined process or owner** | Handles disputes, deletion appeals, safety escalations |

### 4.2 Positive Impact

The wedge is sound and the foundations behind it are real. A rider who logs sessions and keeps horse records in Equina gets a durable, private, single place for information currently scattered across paper folders, phone photos, and WhatsApp threads. The Horse/Records vertical is the one journey where implementation, deployment, configuration, and internal rollout have all converged — private buckets, signed upload tickets, ownership RLS, rollback states, and cleanup workers are genuinely in place.

The product's honesty discipline is itself a user-impact asset. The action registry, the production claim registry, and the feature-flag policy prevent the most common harm in early products: a user trusting a fake success state with real data. No CTA currently claims to upload, post, buy, or list when it only mutates demo state.

### 4.3 Negative Impact And Harm Analysis

**Data loss through prototype state (Medium, active today).** Large parts of the experience — ride timer and recap, Academy progress, nutrition check-offs, saved shop items, Club counters — are React state that resets on reload. This is correctly labelled, but a rider who logs a ride and closes the app loses it. This is an accepted Sprint 1 boundary, not a defect, and it is the main reason the current build cannot be positioned as a daily-use tool for anyone outside the internal rollout.

**Authentication delivery failure (High, blocks rollout).** No custom SMTP is configured. Supabase's default mailer is non-production and restricts recipients. A user who signs up outside the allowed set receives nothing, cannot verify, and cannot recover their password. This makes the account journey unusable for real users — the single largest gate on any expansion.

**Profile over-exposure (High, latent).** Every authenticated account can currently read all profiles, **including location**. For an equestrian product this is not abstract: profile location plus horse identity plus a stable routine describes where a valuable animal is kept and when it is unattended. This must be replaced with a public profile projection and explicit visibility choices before any social surface is enabled worldwide.

**Image metadata leakage (High, latent).** EXIF removal and image normalization are not implemented. Photos of a horse taken at a stable carry GPS coordinates. Public Club and listing media publishing is correctly disabled for exactly this reason; the gate must hold until the processing worker described in `docs/EQUINA_MEDIA_PROCESSING_BOUNDARY.md` exists and is proven with before/after fixtures. The Club composer's photo control exists in the app behind `EXPO_PUBLIC_ENABLE_CLUB_PHOTO_POSTS` (off); turning that flag on before the worker lands reopens this risk.

**Unmoderated social harm (Medium, gated).** Club posts, comments, reactions, reports, moderation jobs, and RLS all exist, but no moderation provider is configured and no human moderation process is staffed. Enabling `clubPublishing` without both would expose users to unreviewed content with no functioning report path.

**Financial harm (High, correctly gated).** Checkout is disabled in both client and database layers, with zero supported buyer and seller countries. The state-machine and webhook code is strong, but Stripe Connect, tax, shipping, legal terms, and dispute operations are absent. Enabling payments in this state would expose buyers to unrecoverable loss and Equina to regulatory liability.

**Safety miscommunication (Medium, controlled).** Equina positions AI as an assistant, not a coach or diagnostician, with confidence derived from structured context coverage rather than model prose. Health records route to professional escalation. This is the correct posture; the risk is drift, not the current design. `coachChat` must stay off until the provider boundary, consent enforcement, timeout handling, and cross-user isolation tests pass.

## 5. Data Protection Impact

Equina processes personal data of EU residents on infrastructure in Frankfurt. This section is a DPIA precursor: it identifies the processing, the risk, and the gaps. It is not a completed DPIA and does not constitute legal advice — a qualified reviewer must sign the final version before public launch.

### 5.1 Categories Of Data Processed

| Category | Examples | Sensitivity | Current control |
| --- | --- | --- | --- |
| Identity | email, display name, avatar | Standard | Supabase Auth; avatar path is server-owned |
| Location | profile location field, image GPS in EXIF | **Elevated** | **Readable by all authenticated users; EXIF not stripped** |
| Animal records | passport, vet, lab, vaccination, dental, farrier, nutrition | Commercially sensitive; not personal health data | Owner/editor RLS, private buckets, signed URLs |
| Private documents | uploaded PDFs and images | **Elevated** | Private Storage, upload tickets, magic-byte checks, scanner adapter |
| Private messages | marketplace conversations | **Elevated** | Participant RLS, TLS; server-readable for moderation |
| AI conversation | Ralf prompts and context | **Elevated** | Persisted with consent controls; provider not configured |
| Device tokens | push registration | Standard | Server-only table, not readable via the mobile Data API |
| Commercial | orders, payouts, disputes, KYC | **Elevated** | Not active |

Horse health data is not special-category personal data under GDPR — it concerns an animal. It is nonetheless treated at an elevated tier because it is commercially valuable, reveals owner behaviour patterns, and users reasonably expect it to be private.

### 5.2 Processors And Transfers

| Processor | Role | Region | Status |
| --- | --- | --- | --- |
| Supabase | Database, Auth, Storage, Edge | Frankfurt (EU) | Active |
| Vercel | Web client hosting | Edge network | Active |
| Expo / EAS | Build, push delivery | US | Build only; push inactive |
| SMTP provider | Transactional email | TBD | **Not selected** |
| AI provider | Ralf inference | TBD | **Not selected** |
| Malware scanner | Upload verification | TBD | **Not selected** |
| Stripe | Payments, Connect, KYC | EU/US | Not active |
| Sentry | Error reporting | TBD | Boundary exists, project not provisioned |

Four processors that will handle personal data are unselected. Each requires a data processing agreement, a transfer basis where non-EU, and an entry in the record of processing activities before it may receive production traffic. Selecting an AI provider in particular requires an explicit decision on training-data usage — rider prompts and horse context must not become provider training data.

### 5.3 Data Subject Rights

| Right | Implementation | Gap |
| --- | --- | --- |
| Access / portability | `request-data-export` exists | **Synchronous, unpaginated, incomplete** — omits parts of Club, media metadata, and seller/listing/order/dispute/review/report history. Untested above 1,000 rows per domain |
| Erasure | Scheduled deletion with 14-day grace, audit trail, recent-auth requirement | Worker implemented but **not deployed**; direct Data API mutation is correctly revoked |
| Rectification | Profile and preference editing | Rollout-gated |
| Objection / restriction | Ralf context controls, reduced personalization, history clearing | Rollout-gated |

The export gap is the material one. An export that silently omits domains is worse than no export, because it presents itself as complete. Replace it with an asynchronous, paginated, versioned, privately-stored job before `accountSettings` is enabled for anyone beyond the internal user.

### 5.4 Retention

No retention schedule is defined for horse records, private documents, message bodies, AI conversation history, moderation reports, or operational logs. Deletion is implemented as an account-level operation, not as per-category expiry. A retention schedule is required before public launch and should be produced alongside the privacy policy.

## 6. Security Impact

### 6.1 Strengths

Database security is the strongest area of the system, at roughly 92% readiness. Ownership RLS, named-user overrides, private buckets, revoked media-registration grants, worker claim tokens, and server-owned columns are all in place and proven by an isolated Postgres suite that tests cross-user horse isolation, viewer/editor rules, blocked direct media registration, worker concurrency, stale-lease recovery, and stale-token rejection.

The P0 media boundary fix in migration `202607290001` is significant: authenticated clients could previously bypass upload tickets, MIME checks, size checks, content hashes, and moderation queues by writing directly to Storage. That path is now closed and remote negative tests confirm anonymous direct upload, direct media registration, and private signed URL creation are all denied.

`npm run backend:audit` now fails the build on nine classes of regression, and `npm run security:bundle-scan` confirms no server secret reaches the client bundle. These guardrails are the reason this posture is likely to hold.

### 6.2 Open Security Risks

| Risk | Severity | State |
| --- | --- | --- |
| Exposed Supabase secret key pasted into a prior development conversation | **Critical** | **Not rotated.** A secret key bypasses RLS entirely |
| No staging environment; one project serves both roles | High | Not provisioned |
| No CAPTCHA/Turnstile, no leaked-password protection, no auth rate-limit monitoring | High | Not configured |
| Malware scanner not configured | High | Adapter boundary exists, provider absent |
| No configured Sentry project, dashboard, or alert routing | High | Code boundary exists only |
| 26 transitive dependency findings (18 high, 7 moderate, 1 low) via Expo/RN build tooling | Medium | Tracked; `npm audit fix --force` must **not** be run |
| Physical iOS/Android session-restore proof absent | Medium | Failure-injection test passes in isolation |

The exposed secret is the second-most-urgent item in this document after version control. It is not present in tracked files, but it must be treated as compromised: rotate or revoke it in the Supabase dashboard and review the access logs.

## 7. Operational Impact

### 7.1 What Running Equina Requires

Activating the currently-gated capabilities does not just add code paths; it creates standing operational obligations that no one has been assigned:

| Obligation | Triggered by | Owner |
| --- | --- | --- |
| Content moderation queue with review deadlines | `clubPublishing`, `clubInteractions` | **Unassigned** |
| Abuse report triage and sanction decisions | any social surface | **Unassigned** |
| Dispute adjudication and refund decisions | `shopTransactions` | **Unassigned** |
| Deletion and export request handling | `accountSettings` | **Unassigned** |
| AI safety escalation review | `coachChat` | **Unassigned** |
| Push delivery and invalid-token hygiene | `pushNotifications` | **Unassigned** |
| On-call for 5 schedulers and 29 functions | any expansion | **Unassigned** |

This is the least-documented dimension of the project. Substantial backend machinery exists for moderation, reporting, sanctions, disputes, and deletion, but there is no operating model behind it — no staffing, no response-time commitment, no escalation path, no queue ownership. A moderation queue with no moderator is not a safety control.

### 7.2 Observability

Request IDs, stable redacted errors, and an optional server-only Sentry boundary exist. There is no configured project, no dashboard, and no alert routing. The audit lists eight required alert classes — auth delivery failures, Edge 4xx/5xx and latency, moderation backlog, upload ticket mismatch and cleanup backlog, notification dead letters, deletion/export failures, Stripe webhook drift, and unresolved Ralf safety events. None are live. Today, a failure in the one active scheduler would be discovered by manual inspection.

### 7.3 Deployment And Environments

One environment serves as both staging and production. Promotion must be migration-by-migration and function-by-function, but there is nowhere to promote *from*. Additionally, the EAS remote environment could not be inspected because the local CLI has no authenticated Expo account — local `eas.json` and `app.json` are clean, but remote EAS variables remain unverified.

## 8. Business And Commercial Impact

### 8.1 Model Alignment

The blueprint ranks subscription first (`Equina Plus`, `Coach Pro`), resale fees second, education third, and listing fees last. The engineering reality matches this ranking, which is a good sign: the subscription-supporting verticals (Horse, Records, Academy, Ralf) are further along than the commerce verticals. Nothing in the current state forces a commerce-first launch.

### 8.2 Revenue Timing

No revenue is possible in the current state. Subscription requires `accountSettings` proven end-to-end; resale requires the entire checkout program. The realistic sequence is:

1. Prove the daily loop with internal and then invited users — no revenue, high learning value.
2. Enable subscription once accounts, export, and deletion are proven — first revenue.
3. Treat commerce as a separate regulated launch — later, and only with legal and finance sign-off.

Attempting to shortcut to step 3 is the principal commercial risk, because it converts a product problem into a regulatory one.

### 8.3 Regulatory Exposure At Commerce Launch

`docs/EQUINA_CHECKOUT_ACTIVATION_CHECKLIST.md` is thorough and its gates should be treated as binding. The exposures it correctly identifies: Stripe Connect account model and cross-border fund flows, per-country KYC, VAT/OSS and deemed-supplier analysis, marketplace seller reporting, consumer cancellation rights, prohibited-goods policy (damaged helmets, unsafe tack, counterfeits, recalled products), shipping insurance and loss ownership, and dispute legal review. To this list add EU marketplace transparency obligations and platform content-moderation duties, which attach to the social surfaces independently of whether payments are enabled.

The checklist's closing rule is the right one and worth restating: **country expansion is a new approval, not a percentage rollout.**

## 9. Consolidated Risk Register

Severity reflects impact if unmitigated. Priority reflects what to do first.

| # | Risk | Severity | Likelihood | Mitigation | Priority |
| --- | --- | --- | --- | --- | --- |
| R1 | Backend and docs exist only on one disk; no version-control baseline | Critical | High | Commit and push the full tree to a private remote today | **P0** |
| R2 | Supabase secret key treated as compromised, not rotated | Critical | Medium | Rotate/revoke, review access logs, verify only publishable keys ship | **P0** |
| R3 | No production email delivery; users cannot verify or recover | High | Certain at rollout | Custom SMTP, SPF/DKIM/DMARC, templates, delivery monitoring | **P0** |
| R4 | No staging environment | High | High | Provision a second Supabase project and a CI promotion path | **P0** |
| R5 | Activated vertical unproven on hosted accounts | High | Medium | Hosted Horse→Record→upload→restart plus Rider A/B/C isolation | **P0** |
| R6 | Profile location readable by every authenticated account | High | Certain at social rollout | Public profile projection plus explicit visibility choices | P1 |
| R7 | EXIF/GPS not stripped from uploaded images | High | Certain at media rollout | Build the processing worker; keep public media disabled | P1 |
| R8 | Data export incomplete and unpaginated | High | Certain at account rollout | Async, paginated, versioned, privately-stored export job | P1 |
| R9 | No moderation, dispute, or support operating model | High | Certain at social/commerce rollout | Define owners, SLAs, escalation before enabling any flag | P1 |
| R10 | No alerting or dashboards | High | High | Provision Sentry, add the eight alert classes | P1 |
| R11 | Malware scanner unconfigured | High | Medium | Contract provider, prove clean/EICAR/timeout/5xx cases | P1 |
| R12 | 4 of 5 workers implemented but undeployed | Medium | Medium | Deploy with secrets and schedules, one worker at a time | P1 |
| R13 | Client still uses mock surfaces for Club, seller drafts, checkout | Medium | Certain | Wire one vertical at a time in the documented order | P1 |
| R14 | `src/App.tsx` is 15,971 lines / 76 components / 76 `useState` hooks | Medium | High | Decompose by route; see the technical design document | P2 |
| R15 | 26 transitive dependency findings | Medium | Medium | Track Expo-compatible upgrades; never `audit fix --force` | P2 |
| R16 | Physical device session-restore unproven | Medium | Medium | iOS and Android process-kill matrix | P2 |
| R17 | Apple/Google providers unconfigured | Medium | Certain at rollout | Full device matrix before exposing buttons | P2 |
| R18 | No retention schedule for any data category | Medium | Certain at launch | Define per-category retention with the privacy policy | P2 |
| R19 | Commerce regulatory program not started | High | Deferred | Keep checkout disabled; treat as separate launch | P3 |

## 10. Impact Of Doing Nothing

If the system is left as it is:

- The version-control risk compounds daily. Every additional hour of work increases what a disk failure destroys.
- The exposed secret remains valid and RLS-bypassing for as long as it is not rotated.
- No user harm accrues, because the fail-closed posture holds. The product simply stops progressing.

The asymmetry matters: the product-side cost of pausing is low, but the two P0 infrastructure risks are time-sensitive and cheap to fix. R1 and R2 should be closed regardless of whether any further product work is scheduled.

## 11. Recommendation

**Do not expand any capability flag until R1–R5 are closed.** They are ordered, cheap relative to their severity, and every subsequent decision depends on them.

Recommended sequence:

1. **Today** — commit and push the working tree to a private remote (R1); rotate the exposed Supabase secret (R2).
2. **Week 1** — configure custom SMTP with domain authentication, CAPTCHA, and leaked-password protection (R3); provision a staging Supabase project with a CI promotion path (R4).
3. **Week 2** — run the hosted Horse→Record→upload→restart journey and the Rider A/B/C isolation matrix on real accounts; run physical iOS and Android session-restore (R5, R16).
4. **Week 3–4** — provision Sentry and the eight alert classes (R10); replace the export with an async paginated job (R8); ship the public profile projection (R6).
5. **Then, and only then** — expand the internal Horse/Records override beyond one user, and begin the media processing worker (R7) that unblocks Club.
6. **Separately, not on this track** — start the commerce regulatory program (R19) with named legal, finance, and support owners.

Two structural recommendations sit alongside the sequence. First, assign an owner to every operational obligation in section 7.1 before enabling the flag that creates it; a queue without a human is not a control. Second, keep the existing honesty discipline — the action registry, the production claim registry, and the release gate are the reason this system carries so little user-facing risk despite being far from finished. They should survive contact with launch pressure.

## 12. Sign-Off

| Role | Decision required | Status |
| --- | --- | --- |
| Engineering | R1, R2, R4, R5 execution | Open |
| Product | Rollout sequence and internal cohort size | Open |
| Privacy/Legal | Processor selection, DPIA completion, retention schedule | Open |
| Finance/Legal | Commerce program go/no-go | Deferred |
| Operations | Owners and SLAs for section 7.1 | Open |

Related documents: `EQUINA_TECHNICAL_DESIGN.md`, `EQUINA_SERVICE_DESIGN.md`, `EQUINA_BACKEND_AUDIT_2026-07-29.md`, `EQUINA_BACKEND_DEPLOYMENT_INVENTORY.md`, `EQUINA_CHECKOUT_ACTIVATION_CHECKLIST.md`, `EQUINA_FEATURE_FLAG_POLICY.md`, `EQUINA_ACTION_REGISTRY.md`.
