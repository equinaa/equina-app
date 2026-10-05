# Equina Next Steps

Plan date: 2026-08-25 (Tuesday)
Covers: the first hour, the scope decision, and six weeks to a first real cohort
Basis: `EQUINA_IMPACT_ASSESSMENT.md`, `EQUINA_TECHNICAL_DESIGN.md`, `EQUINA_SERVICE_DESIGN.md`
Status: proposed — section 2 needs a decision before week 1 starts

This plan does one thing the three assessment documents deliberately do not: it picks. The assessments list everything that is true. This picks what to do about it, in what order, and what to stop doing.

## 1. The First Hour — Today

This is not sprint work and it is not scheduled. It happens before anything else in this document, because until it is done every plan below is hypothetical.

### 1.1 Put the work under version control

The repository has one commit, `95b943b`, dated 2026-06-01, tracking 28 files. Everything from Sprint 2 onward — including all 85 files under `supabase/`, every migration and every Edge Function — exists only on one disk.

Sequence:

1. Confirm no secret is about to be committed. `.env` and `.env.*` are already ignored; verify nothing else carries a key:

```text
npm run security:bundle-scan
git status --porcelain
```

2. Review what is about to be added. Expect roughly 48 entries, including the whole `supabase/` tree, `src/backend/`, `src/features/`, `scripts/`, and 21 documents in `docs/`.

3. Commit and push to a **private** remote. One commit for the whole state is fine — the point is a baseline, not a clean history.

4. Confirm the remote actually has it: clone into a temporary directory and check that `supabase/migrations` contains 34 files and `supabase/functions` contains 29 function directories.

Step 4 is the one people skip. A push that silently excluded a directory is the same as no push.

**Exit criterion:** a fresh clone of the remote builds, typechecks, and passes `npm test`.

### 1.2 Rotate the exposed Supabase secret key

A secret key was pasted into a prior development conversation. It bypasses RLS entirely, which means it ignores every ownership policy in the system.

1. Rotate or revoke it in the Supabase dashboard.
2. Review the project access logs for use of the old key.
3. Confirm only publishable keys exist in Expo and Vercel configuration.
4. Confirm the running client still works — it should, because it only ever used the publishable key.

**Exit criterion:** the old key is invalid and the deployed client is unaffected.

### 1.3 Do not start anything else today

Both items above are under an hour combined. Resist the urge to continue into week 1 on the same day — the point of a baseline is that it exists before the next change, not alongside it.

## 2. The Scope Decision — Needs An Answer This Week

Everything after this section assumes a decision that has not been made yet. **Make it before week 1 starts.**

### 2.1 The problem, in numbers

| Built | Reaching a user |
| --- | --- |
| 29 Edge Functions implemented | 6 deployed |
| 5 workers with claims and leases | 1 scheduled |
| 10 product capabilities with backend | 0 enabled |
| 34 migrations covering six product areas | 1 vertical proven, for 1 internal user |

This is not an execution failure. The work is good — database security sits near 92% readiness and the media boundary is genuinely well designed. It is a scope failure: backend was built for six products at once (journal, Club, marketplace, messaging, checkout, AI) and none of them reached a real person.

### 2.2 The proposal

**Finish, over the next three months:**

- onboarding and account
- the daily ride loop, persisted
- Horse and Records
- Academy

**Freeze, completely:**

- Club
- Marketplace, buyer and seller
- Messaging
- Push notifications
- Checkout and everything commercial

Frozen means no new code. The surfaces stay exactly as they are — read-only, honestly labelled, feature-flagged off. Nothing is deleted and nothing is wasted; the backend keeps sitting there until there is a reason to activate it.

### 2.3 Why these four

They are the wedge from the product blueprint: *AI-assisted training and horse-care journal*. That wedge was chosen because it works before network effects exist — one rider with one horse gets value on day one. Club, marketplace, and messaging all need other people to be useful, which means they cannot be validated by a small cohort.

They are also where the backend is furthest along. Horse and Records is the only journey where implementation, deployment, configuration, and rollout have all converged. Building on the one proven vertical is cheaper than proving a second one.

### 2.4 What it costs

Little, materially. No code is discarded. The visible cost is that the product demo stops growing for three months — the app will not gain new surfaces, it will gain depth in four of them.

The real cost is a promise, if one has been made externally. See section 6.

## 3. Week 1 — Delivery And Environments (31 Aug – 4 Sep)

**Goal:** a stranger can create an account, and there is somewhere to test that is not production.

| Item | Detail |
| --- | --- |
| Custom SMTP | Contract a provider, verify the sending domain, keep the API key out of Expo and git |
| Domain authentication | SPF, DKIM, DMARC |
| Templates | Replace the magic-link template in `supabase/templates/magic_link.html` with the six-digit token template; set `EXPO_PUBLIC_EQUINA_EMAIL_AUTH_MODE=otp` |
| Abuse controls | CAPTCHA/Turnstile, leaked-password protection, auth rate-limit monitoring |
| Staging project | A second Supabase project, separate from `mvdxohyayriywbcknulg` |
| CI | `typecheck`, `test`, `backend:check`, `backend:audit`, `security:bundle-scan` as required checks |

Never copy a database password, service key, automation secret, provider secret, or private Storage object between environments. Promotion is migration by migration and function by function.

**Exit criteria:**

- an email to an address outside the allowlist arrives, verifies, and recovers;
- expiry, resend throttling, and invalid codes all behave correctly;
- a migration can be promoted from staging to production through CI;
- a failing `backend:audit` blocks a merge.

**Blocked by:** section 1.1. CI has nothing to run against without a remote.

## 4. Week 2 — Prove The Activated Vertical (7 – 11 Sep)

**Goal:** stop describing Horse and Records as working and demonstrate it on real hosted accounts.

| Test | What it proves |
| --- | --- |
| Horse → Record → private upload → app restart | The one activated vertical survives a real session boundary |
| Horse → Record → private upload → browser restart | Web session restore works |
| Rider A / Rider B / unauthorized Rider C | Hosted RLS isolation, not just PGlite isolation |
| Physical iOS process kill and relaunch | Chunked SecureStore behaviour under real termination |
| Physical Android process kill and relaunch | Same, other platform |

Use consented QA accounts on staging. The isolated Postgres suite already proves the policies; what it cannot prove is the hosted project, real Auth, and real devices.

**Exit criteria:** all five pass, with evidence recorded. Until then the internal override stays at one user.

**Blocked by:** week 1 — the A/B/C matrix needs accounts, and accounts need email.

## 5. Weeks 3–4 — Persist The Daily Loop (14 – 25 Sep)

**Goal:** the ride recap survives a reload.

This is the most important product work in the plan. The daily loop is the retention engine of the entire product and it currently forgets everything: elapsed time, completed phases, the rider note, and the horse-feel check-in are all React state.

| Item | Detail |
| --- | --- |
| Ride entry persistence | Migration plus repository, following the `RecordsRepository` pattern |
| Edit and delete a ride entry | A journal you cannot correct is not a journal |
| Home state model | Wire the seven states — first session, pre-ride, active, post-ride, care due, recovery, no horse — to real data |
| Academy lesson progress | Persist progress and completion |
| Extract `features/home` | Move HomeScreen out of `App.tsx` **in the same change** |
| Extract `features/academy` | Same, alongside lesson persistence |

The two extractions are not a separate refactor. `src/App.tsx` is 15,971 lines — 54% of the source tree, 76 components, 76 `useState` calls, and a 9,000-line style sheet. Decomposing it as its own project is high-risk and gets deprioritised forever. Extracting one screen at the moment it moves from prototype to repository is low-risk and free.

**Rules while doing this:** keep the recap factual. Elapsed time, completed phases, rider note, horse-feel check-in. No inferred training quality, no invented metrics, and the check-in stays attributed to the rider.

**Exit criteria:** log a ride, close the app, reopen it, and the recap is there — on iOS, Android, and web.

## 6. Weeks 5–6 — First Real Cohort (28 Sep – 9 Oct)

**Goal:** find out whether the wedge holds, with ten riders instead of one internal user.

Everything up to here measures technical readiness. None of it tells you whether anyone wants the product. Ten riders for two weeks will.

Before inviting anyone:

| Prerequisite | Why |
| --- | --- |
| Public profile projection and visibility choices | Every authenticated account can currently read every profile, **including location**. For horse owners this is physical security, not just privacy. *Done 2026-10-05 (202610050002): other riders see name and photo only.* |
| Sentry provisioned, alerts routed | Today a failure is found by manual inspection |
| Async paginated data export | The current export is synchronous and silently omits domains |
| Account deletion worker deployed | Deletion is implemented but not running |
| A named support contact in the app | Ten real users will have problems and need somewhere to send them |
| Retention schedule drafted | Needed alongside the privacy policy |

What to measure — behaviour, not opinion:

- how many riders log a second session without being asked;
- how many log a session in week two;
- how many add a horse record unprompted;
- where they stop.

Ten people who each log three rides tells you more than fifty who install and never return.

## 7. What Not To Do

**Do not start the commerce program.** It is a separately regulated launch — Stripe Connect account model, per-country KYC, VAT/OSS and deemed-supplier analysis, prohibited goods, shipping insurance, dispute adjudication. Every item in `EQUINA_CHECKOUT_ACTIVATION_CHECKLIST.md` needs an accountable owner and staging evidence. Touching it now consumes the whole team for zero additional users. Supported seller countries: none. Supported buyer countries: none. Keep it that way.

**Do not enable any social surface without a human behind it.** Club has posts, comments, reactions, reports, moderation jobs, and RLS. It has no moderator, no review deadline, no sanction ladder, and no appeal path. A report button nobody reads is worse than no report button — it converts the rider's effort into false assurance.

**Do not decompose `App.tsx` as a standalone project.** Extract screens as they migrate, per section 5.

**Do not run `npm audit fix --force`.** The 26 transitive findings come through Expo and React Native build tooling; the automated fix requires breaking framework changes. Track Expo-compatible upgrades and reassess each SDK release.

**Do not expand the internal override before week 2 passes.** One user until the hosted matrix is green.

## 8. Open Decisions

These need a person, not a sprint.

| # | Decision | Who | By |
| --- | --- | --- | --- |
| D1 | Approve or reject the scope freeze in section 2 | Product | Before 31 Aug |
| D2 | Is there an external commitment — investor, partner, or customer — that requires marketplace or Club on a fixed date? | Product | Before 31 Aug |
| D3 | Who owns moderation, support, safety escalation, and on-call? One named person is enough at this scale | Operations | Before week 6 |
| D4 | Which AI provider, and on what terms? Rider prompts and horse context must never become training data | Product + Legal | Before Ralf is unfrozen |
| D5 | Processor DPAs and DPIA completion for SMTP, AI, scanner, and moderation | Legal | Before week 6 |

D2 is the one that can invalidate this plan. If a date has been promised externally for a frozen surface, the sequence has to be rebuilt around it — and that is a different conversation, because it means proving two verticals at once with the same team.

## 9. Summary

| When | What | Done means |
| --- | --- | --- |
| Today | Push the tree, rotate the key | A fresh clone passes `npm test`; the old key is dead |
| This week | Decide the scope freeze | D1 and D2 answered |
| 31 Aug – 4 Sep | SMTP, abuse controls, staging, CI | A stranger can sign up and recover |
| 7 – 11 Sep | Hosted and device proof | Five tests pass with evidence |
| 14 – 25 Sep | Persist the daily loop | The recap survives a reload on three platforms |
| 28 Sep – 9 Oct | Ten real riders | Second-week retention is measured, not guessed |

One principle holds across all of it, and it is the most valuable thing this project already has: the action registry, the production claim registry, and the release gate exist so that nothing can be described as working before it is. Launch pressure will push against them. Keep them.

Related documents: `EQUINA_IMPACT_ASSESSMENT.md`, `EQUINA_TECHNICAL_DESIGN.md`, `EQUINA_SERVICE_DESIGN.md`, `EQUINA_CHECKOUT_ACTIVATION_CHECKLIST.md`, `EQUINA_FEATURE_FLAG_POLICY.md`, `EQUINA_BACKEND_DEPLOYMENT_INVENTORY.md`.
