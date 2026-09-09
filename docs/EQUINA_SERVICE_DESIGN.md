# Equina Service Design

Design date: 2026-08-25
Scope: the whole Equina service — the app, the humans behind it, the processes that must run for it to be trustworthy, and the moments where it can fail a rider.

The product documentation in this repository is strong on interface and backend. It is nearly silent on the service: who answers a report, who adjudicates a dispute, who reviews a safety escalation, and how fast. This document closes that gap and defines the service that has to exist before the flags in `docs/EQUINA_FEATURE_FLAG_POLICY.md` can move.

## 1. Service Proposition

> Equina is the place a rider keeps what matters about their horse — training, care, records, and questions — and gets useful, honest help with it.

The service promise has four parts, in priority order:

1. **What you record stays yours and stays safe.** Private by default, exportable, deletable.
2. **What we tell you is honest about its own limits.** Guidance, not diagnosis; screening, not fit certification; confidence derived from data coverage, not from tone.
3. **What you can do, you can actually do.** No control claims an outcome it cannot deliver.
4. **When something goes wrong, a human handles it.** Reports, disputes, deletion requests, and safety escalations reach a person within a stated time.

Promises 1–3 are largely designed and partly built. **Promise 4 has no owner, no process, and no staffing.** That is the central finding of this document.

## 2. Service Principles

Derived from the product psychology contract and the experience laws, restated as service rules:

| Principle | What it forbids | What it requires |
| --- | --- | --- |
| Honest capability | Fake success states, invented percentages, "escrow" language, unsupported health claims | Every disabled action states its boundary plainly |
| Named source | Presenting demo quantities as a feeding plan; treating model prose as confidence | Every visible metric names its source or is removed |
| Healthy repetition | Streak anxiety, fake urgency, random rewards, notification bait | Competence, autonomy, relatedness, and trust in every loop |
| Human recourse | Automated-only moderation, disputes, or deletions | A named owner and a response time for every queue |
| Professional escalation | Diagnosing, prescribing, confirming saddle fit | Routing to vet, saddler, or coach with the triggering observations shown |
| Reversibility | Silent destructive actions | Edit, undo, exit, grace periods, and confirmations |

## 3. Actors

### 3.1 Users

| Actor | Core need | Served today |
| --- | --- | --- |
| **Rider** (primary) | One trusted place for training and horse records | Partly — 1 internal user has real persistence; everyone else sees labelled samples |
| **Coach** | Follow riders, answer questions, annotate | No — role exists in the type system, no journey |
| **Buyer** | Inspect gear honestly before committing | Read-only browse |
| **Seller** | List gear, get paid, be trusted | Read-only sample dashboard |

### 3.2 Service Providers (internal)

| Actor | Responsibility | Status |
| --- | --- | --- |
| **Moderator** | Review reported content within deadline, decide sanctions | Backend exists (`moderate-report`, `lift-sanction`, moderation jobs, RLS). **No person, no process, no SLA** |
| **Support** | Handle disputes, deletion appeals, delivery failures, account problems | **Does not exist** |
| **Safety reviewer** | Review Ralf escalations and health-flag events | **Does not exist** |
| **On-call engineer** | Respond to scheduler, function, and provider failures | **Does not exist**; no alerting to respond to |
| **Finance/legal** | Payout reconciliation, tax, terms, prohibited goods | **Not engaged** |

### 3.3 External Providers

SMTP, AI, malware scanning, content moderation, Stripe, Expo push, Sentry. All seven sit behind adapters. **None is contracted or configured.** Each is a service dependency, not just a technical one: an unconfigured SMTP provider does not degrade the service, it removes the ability to create an account at all.

## 4. Service Ecosystem Map

```
                         ┌──────────────┐
                         │    RIDER     │
                         └──────┬───────┘
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
   ┌────▼─────┐          ┌──────▼──────┐         ┌──────▼──────┐
   │  Vet /   │          │   EQUINA    │         │   Coach /   │
   │ Farrier  │◄─escalate┤   SERVICE   ├─escalate►│  Saddler   │
   └──────────┘          └──┬───┬───┬──┘         └─────────────┘
                            │   │   │
        ┌───────────────────┘   │   └──────────────────┐
        │                       │                      │
  ┌─────▼──────┐        ┌───────▼───────┐      ┌───────▼───────┐
  │ Moderator  │        │    Support    │      │Safety reviewer│
  │  (unstaffed)│        │  (unstaffed)  │      │  (unstaffed)  │
  └─────┬──────┘        └───────┬───────┘      └───────┬───────┘
        │                       │                      │
        └───────────────┬───────┴──────────────────────┘
                        │
              ┌─────────▼──────────┐
              │  PLATFORM (Supabase │
              │  · Edge · Workers)  │
              └─────────┬──────────┘
                        │
    SMTP · AI · Scanner · Moderation · Stripe · Push · Sentry
              (adapters exist, none contracted)
```

Three of the four internal service roles are empty boxes. The platform is the most complete part of the ecosystem and the humans are the least.

## 5. Service Blueprints

Each blueprint uses five layers: **Evidence** (what the rider sees), **Rider actions**, **Frontstage** (system response the rider perceives), **Backstage** (system work the rider does not see), and **Support process** (human work). A `⚠` marks a gap that blocks activation.

### 5.1 Onboarding And Account Creation

| Layer | Detail |
| --- | --- |
| **Evidence** | Discipline imagery, three-stage progress, email inbox, starter pack |
| **Rider actions** | Choose discipline and level → add horse (optional) → preview → enter email → verify → land on Home |
| **Frontstage** | Draft answers held locally; social buttons only where the provider is proven; verification screen with resend cooldown; completion transition bridging the discipline image into Home |
| **Backstage** | Draft persisted locally until verification; Supabase Auth (PKCE, secure change enabled); `complete_equina_onboarding` writes profile, preferences, and one primary horse **idempotently**; `onboarding_starter_packs` prevents duplicate rewards on retry |
| **Support** | ⚠ Nobody handles "I never got the email" |

**Failure points.** ⚠ **No custom SMTP** — the default mailer restricts recipients, so verification silently fails for most addresses. This is the single hardest stop in the whole service. ⚠ **No CAPTCHA or leaked-password protection.** ⚠ Apple/Google buttons must stay hidden until each provider's full device matrix passes.

**Design strength worth keeping:** rider context is collected *before* account creation, and the handoff is idempotent, so a retry cannot produce a duplicate horse. The service asks for commitment only after it has shown value.

### 5.2 Daily Ride Loop

| Layer | Detail |
| --- | --- |
| **Evidence** | Home briefing with one suggested ride; three-phase timer; factual recap |
| **Rider actions** | Open app → read one suggestion → start ride → advance phases → finish → record how the horse felt |
| **Frontstage** | Home is a state machine — first session, pre-ride, active, post-ride, care due, recovery day, no horse — with **one** primary action per state |
| **Backstage** | ⚠ Ride timer, phases, and check-in are React state only |
| **Support** | None needed |

**Failure point.** ⚠ **The recap is lost on reload.** This is the retention engine of the entire product and it does not persist. The daily loop cannot be offered to any real user until ride entries are written through a repository.

**Design strength:** the recap reports elapsed time, completed phases, and a rider-entered horse-feel check-in — all facts. It never infers training quality, and the horse-feel value is explicitly attributed to the rider, not derived. This is exactly the honesty the service promises.

### 5.3 Horse Records And Documents

| Layer | Detail |
| --- | --- |
| **Evidence** | Horse switcher, timeline, record sheets, uploaded passport/vet/lab documents |
| **Rider actions** | Select horse → open timeline → add a record → attach a document → return later and find it |
| **Frontstage** | Loading, empty, error, offline, permission-denied states; optimistic updates with rollback; upload progress, cancel, retry |
| **Backstage** | Real Supabase CRUD for passport, vet, lab, vaccination, dental, farrier, nutrition, care, notes. Upload path: `create-upload-ticket` → direct private upload → `complete-upload` (owner check, ticket expiry, path ownership, size, MIME, magic bytes, SHA-256) → scanner adapter → active media reference. Orphans cleaned every 5 minutes |
| **Support** | ⚠ Nobody handles "my document disappeared" |

**Status.** This is the **only journey where implementation, deployment, configuration, and internal rollout have all converged.** It works for one named internal user.

**Failure points.** ⚠ Not proven on hosted accounts — the Horse→Record→upload→restart journey and Rider A/B/C isolation have not been run against the live project. ⚠ Malware scanner not contracted. ⚠ EXIF/GPS not stripped — a stable photo carries its coordinates.

### 5.4 Academy And Ralf

| Layer | Detail |
| --- | --- |
| **Evidence** | One personalized path, searchable lessons, Ralf conversation |
| **Rider actions** | Read a recommendation and its reason → open a lesson → ask Ralf → act on the answer |
| **Frontstage** | Explainable recommendation reasons; editable Ralf context; confidence shown only where it aids a decision; health suggestions phrased as `consider a vet review` **with the rider-entered observations that triggered them** |
| **Backstage** | Persisted conversations with ownership RLS; every response carries task type, factual context used, confidence reason, safety class, escalation rule, provider version; ⚠ lesson progress is local only |
| **Support** | ⚠ **No safety reviewer** for escalation events |

**Failure points.** ⚠ No AI provider contracted — and selecting one requires an explicit decision that rider prompts and horse context are **not** used as training data. ⚠ Safety escalations have nowhere to go. ⚠ Lesson progress resets on reload.

**Design strength:** confidence is derived from structured context coverage, never accepted from model prose. Ralf cannot diagnose, prescribe, replace a coach, or confirm equipment fit. The saddle-fit screening returns qualitative states — `Worth inspecting`, `Measurements needed`, `Ask the seller` — and routes to a qualified saddler. An arbitrary fit percentage was deliberately removed. This is the clearest example in the codebase of the service refusing to overclaim.

### 5.5 Club

| Layer | Detail |
| --- | --- |
| **Evidence** | Feed, post detail, comments, reactions, report and block controls |
| **Rider actions** | Read → post → attach a photo or ride → comment → report something harmful |
| **Frontstage** | Optimistic actions with rollback; visible moderation and deleted-content states |
| **Backstage** | Posts, comments, reactions, reports, moderation jobs, and RLS all exist; ⚠ **the UI is wired to a mock API and local reaction counters** |
| **Support** | ⚠ **Moderation queue with no moderator** |

**Failure points.** ⚠ No moderation provider configured. ⚠ No human moderation process, deadline, or escalation path. ⚠ Every authenticated account can read all profiles **including location** — for an equestrian product this discloses where a valuable animal is kept. ⚠ Public media publishing is blocked on the missing EXIF processor.

**Service rule:** a report button that opens a queue nobody reads is worse than no report button, because it converts the rider's effort into false assurance. Club must not activate until a named moderator, a review deadline, and a sanction/appeal path exist.

### 5.6 Marketplace — Buyer

| Layer | Detail |
| --- | --- |
| **Evidence** | Listings, condition evidence, seller trust signals, fit screening, protection explanation |
| **Rider actions** | Browse → inspect → screen fit → message the seller → (blocked) buy |
| **Frontstage** | Real public catalog reads, uncoupled from messaging, with no production seed fallback; honest missing-measurement states; checkout is an explicit read-only preview |
| **Backstage** | Participant RLS, blocking, reports, message nonces, outbox, Realtime; strong order state machine and webhook code |
| **Support** | ⚠ **No dispute adjudicator, no support ownership** |

**Failure points.** ⚠ Messaging is unproven on two devices. ⚠ Checkout is disabled with **zero supported buyer and seller countries** — correctly, given no Stripe Connect, tax, shipping, legal terms, or dispute operations.

**Language rule:** the payment model is protected marketplace payment with delayed seller transfer. It must **never** be described as escrow without a licensed escrow provider. Similarly, message privacy is TLS plus participant RLS with server-side readability for fraud and moderation — never "end-to-end encrypted", and never with delivery, presence, or typing guarantees.

### 5.7 Marketplace — Seller

| Layer | Detail |
| --- | --- |
| **Evidence** | Dashboard, listings, orders, revenue, payout state, verification status |
| **Rider actions** | Verify identity → create a listing → answer buyers → ship → get paid |
| **Frontstage** | ⚠ All sample/read-only |
| **Backstage** | `seller-onboarding`, `review-listing`, `release-order`, `resolve-dispute`, `stripe-webhook` implemented; ⚠ **none deployed** |
| **Support** | ⚠ Nobody owns payout reconciliation, KYC review, or prohibited-goods enforcement |

**Gate:** every item in `docs/EQUINA_CHECKOUT_ACTIVATION_CHECKLIST.md` must have an accountable owner and staging evidence. Country expansion is a new approval, not a percentage rollout.

### 5.8 Account Controls — Export And Deletion

| Layer | Detail |
| --- | --- |
| **Evidence** | Export download link; deletion confirmation with a stated effective date |
| **Rider actions** | Request my data → receive it → verify it is complete → optionally delete my account → optionally change my mind |
| **Frontstage** | Recent-authentication requirement; **14-day grace period**; cancel before the effective date; signed export link with stated expiry |
| **Backstage** | Deletion Edge Functions with audit trail; direct Data API mutation correctly revoked; export cleanup has leases; ⚠ deletion worker **implemented but not deployed** |
| **Support** | ⚠ Nobody handles a failed export or a contested deletion |

**Failure point.** ⚠ `request-data-export` is **synchronous and unpaginated**. It omits parts of Club, media metadata, and seller/listing/order/dispute/review/report history, and has never been tested above 1,000 rows per domain. An export that silently omits domains is worse than none, because it presents itself as complete. It must become an asynchronous, paginated, versioned, privately-stored job before `accountSettings` activates.

**Design strength:** the 14-day grace period with an explicit cancel path is genuinely good service design. Account deletion is the most irreversible thing a rider can do, and the service gives them two weeks to change their mind.

## 6. Moments Of Truth

The six points where trust is won or lost:

| # | Moment | Rider's question | Current answer |
| --- | --- | --- | --- |
| M1 | Verification email arrives | "Is this real?" | ⚠ **Often never arrives** |
| M2 | First ride recap | "Did it keep what I did?" | ⚠ **No — it resets** |
| M3 | Reopening a record days later | "Is my horse's history safe here?" | ✓ Yes, for the internal user |
| M4 | Ralf answers a health question | "Is this responsible?" | ✓ Yes by design; ⚠ no provider, no reviewer |
| M5 | Reporting harmful content | "Does anyone read this?" | ⚠ **No** |
| M6 | Requesting data or deletion | "Am I actually in control?" | ⚠ Grace period yes; export incomplete |

M1 and M2 are the two that decide whether the product has any users at all. Both are gated on work that is cheap relative to its impact: configure SMTP, and persist ride entries through the repository layer.

## 7. Channel Design

| Channel | Purpose | Rules | Status |
| --- | --- | --- | --- |
| In-app | Primary surface | One primary action per view; every metric names its source; disabled actions state their boundary | Active |
| Email | Verification, recovery, export links | Branded templates; SPF/DKIM/DMARC; delivery monitoring | ⚠ Not configured |
| Push | Human messages, order changes, horse reminders, academy reminders | **Redacted payloads only** — `New message about [listing]`, route, conversation ID. Never message bodies, horse health, AI prompts, email, or payment data. Quiet hours enforced; badges only for critical updates | ⚠ Not activated |
| Support | Human recourse | ⚠ **Does not exist — no address, no queue, no SLA** | ⚠ |

The push design is notably disciplined: category preferences, quiet hours with a timezone, redacted previews, sign-out revocation, and invalid-token cleanup are all specified. The rule against notification bait is written into the psychology contract, not just implied.

## 8. The Missing Operating Model

Substantial backend machinery exists for moderation, reporting, sanctions, disputes, deletion, and safety escalation. **None of it has a human behind it.** This table is the work that has to happen before the corresponding flags may move — and it is not engineering work.

| Queue | Triggered by | Needs | Owner | SLA |
| --- | --- | --- | --- | --- |
| Content moderation | `clubPublishing`, `clubInteractions`, `listingCreation` | Reviewer, review deadline, sanction ladder, appeal path | **Unassigned** | **Undefined** |
| Abuse reports | any social surface | Triage rules, block/report handling, repeat-offender policy | **Unassigned** | **Undefined** |
| Safety escalation | `coachChat` | Reviewer able to judge health-flag events | **Unassigned** | **Undefined** |
| Deletion and export | `accountSettings` | Failure handling, contested-deletion path | **Unassigned** | **Undefined** |
| Disputes and refunds | `shopTransactions` | Adjudicator, evidence rules, refund authority | **Unassigned** | **Undefined** |
| Platform on-call | any expansion | Alert routing, runbook, escalation | **Unassigned** | **Undefined** |

**Recommendation: no capability flag may be enabled until its queue in this table has a named owner and a stated response time.** At current scale — one internal user — a single named person covering all six queues on a next-business-day commitment is sufficient and honest. What is not acceptable is enabling a report button with no reader.

## 9. Service Readiness Matrix

| Journey | Designed | Built | Deployed | **Operable** | Verdict |
| --- | --- | --- | --- | --- | --- |
| Onboarding | ✓ | ✓ | partial | ⚠ no email delivery | **Blocked** |
| Daily ride loop | ✓ | prototype | — | n/a | **Not persistent** |
| Horse records | ✓ | ✓ | ✓ | internal only | **Closest to ready** |
| Academy | ✓ | prototype | — | n/a | Not persistent |
| Ralf | ✓ | ✓ | — | ⚠ no provider, no reviewer | Blocked |
| Club | ✓ | backend only | — | ⚠ no moderator | Blocked |
| Marketplace browse | ✓ | ✓ | ✓ | ✓ | Read-only, fine |
| Marketplace messaging | ✓ | ✓ | — | ⚠ no two-device proof | Blocked |
| Seller | ✓ | backend only | — | ⚠ no owner | Blocked |
| Checkout | ✓ | backend only | — | ⚠ no legal, finance, support | **Correctly disabled** |
| Export / deletion | ✓ | partial | — | ⚠ export incomplete | Blocked |

"Operable" is the column this document adds, and it is the one that fails most often. The pattern across the matrix is consistent: **Equina's engineering is well ahead of its operations.**

## 10. Service Recommendations

**Immediate — restores the service's ability to have users at all**

1. Configure custom SMTP with domain authentication, branded templates, and delivery monitoring. Without it there is no service, only a demo. (M1)
2. Persist ride entries through the repository layer. The daily loop is the retention engine and it currently forgets. (M2)

**Before any social or account surface activates**

3. Name one person as moderator, support, and safety reviewer, with a next-business-day response commitment. Publish a support contact in-app.
4. Replace broad profile reads with a public projection plus explicit visibility choices. Location exposure is a physical-security concern for horse owners, not only a privacy one.
5. Replace the synchronous export with an async, paginated, versioned job.
6. Build the EXIF/normalization worker before any media becomes public.

**Before commerce is considered at all**

7. Treat checkout as a separate regulated launch with named legal, finance, and support owners, per the activation checklist. Do not schedule it on the product track.

**Ongoing**

8. Keep the action registry, the production claim registry, and the release gate. They are the mechanism that makes the honesty promise enforceable rather than aspirational, and they are the most valuable service asset the project has.

Related documents: `EQUINA_IMPACT_ASSESSMENT.md`, `EQUINA_TECHNICAL_DESIGN.md`, `EQUINA_ACTION_REGISTRY.md`, `EQUINA_EXPERIENCE_STATE_CONTRACT.md`, `EQUINA_INTERACTION_CONTRACT.md`, `EQUINA_DESIGN_CONTRACT.md`, `EQUINA_FEATURE_FLAG_POLICY.md`, `EQUINA_CHECKOUT_ACTIVATION_CHECKLIST.md`.
