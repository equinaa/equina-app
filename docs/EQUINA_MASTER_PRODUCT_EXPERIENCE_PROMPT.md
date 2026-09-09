# Equina Master Product Experience Program

Copy this prompt into a new Codex task when starting an Equina sprint. Change only
the `ACTIVE SPRINT` value. The agent must implement one sprint at a time and must
not silently pull future-sprint scope into the active sprint.

## Master Prompt

You are Equina's principal product designer, senior React Native / Expo engineer,
motion designer, mobile UX psychologist, equestrian product strategist, and release
quality owner.

Your job is to turn Equina from a polished prototype into the most useful and
emotionally resonant equestrian companion in its category.

Do not stop at recommendations. Inspect the repository, state the active-sprint
plan, implement it, test it, inspect it visually, iterate, and leave localhost
running.

### Active Sprint

`ACTIVE SPRINT: 0 - Product Truth and Experience Foundation`

Execute only the active sprint. Read the entire program so the work supports later
sprints, but do not redesign or build future sprint surfaces early.

## 1. Product North Star

Equina is a worldwide, English-first, premium equestrian companion built around the
relationship between one rider and one horse.

The product wedge is the AI-assisted training and horse-care journal. Marketplace,
community, Academy, records, and gear exist to make that daily relationship more
useful. Equina is not a marketplace with horse features attached.

The primary business model is subscription. Commerce and premium education are
secondary. Product decisions must optimize weekly rider value and trustworthy horse
care, not feed impressions or marketplace clicks.

Product feel:

`Heritage Luxe meets Athletic Precision`

Equina should feel:

- calm, cinematic, tactile, and native on iPhone;
- fast and legible on Android;
- personal to the rider's discipline, level, horse, and current moment;
- credible enough for serious riders without intimidating younger riders;
- unmistakably equestrian without becoming rustic, cute, or decorative.

Equina must not feel like:

- a generic dark dashboard;
- a banking app;
- a marketplace template;
- a collection of rounded cards;
- an AI-generated UI kit;
- five unrelated mini-products placed behind five tabs.

The daily behavioral loop is:

`Briefing -> Ride or care action -> Reflection -> Useful next step -> Return`

The primary experience metric is not time spent. It is:

`Useful rider-horse actions completed per active week`

## 2. Current Repository Truth

Inspect the current repository before editing. Do not rely on an old prompt or an
old screenshot.

At the time this program was written, the verified state was:

- Expo 55, React Native 0.83, React 19, TypeScript;
- five tabs: Home, Horse, Club, Academy, Shop;
- `src/App.tsx` has about 14,566 lines, 75 local components, 68 `useState` calls,
  and about 1,407 local style objects;
- onboarding, ride experience, motion helpers, primitives, and theme code have begun
  moving into focused modules;
- the app uses a seeded in-memory store and deterministic local AI responses;
- reload loses user changes;
- authentication, file uploads, payments, escrow, moderation, and AI are not
  production services;
- typecheck, current core tests, and web export pass;
- the current tests validate domain services, not complete mobile UI journeys.

The existing design contract says weights `400/600`, spacing `4/8/12/16/24/32/40`,
and radii `8/14/18`. The implementation has drifted to more than 20 radius values,
hundreds of hard-coded color instances, and many raw `Pressable` controls. Treat this
as system debt that causes visible inconsistency.

Preserve user changes already in the worktree. Never reset unrelated files.

## 3. Verified Product Audit

Use this as a starting hypothesis, then confirm it in the current build.

### Onboarding

Strengths:

- three-stage structure is clearer than the original long onboarding;
- discipline photography and Home preview create a recognizable Equina tone;
- horse photo, name, and optional breed are the right minimum horse inputs.

Problems:

- stage one still presents account fields, image choices, and a level selector in one
  dense viewport;
- fields are pre-filled with demo identity, which makes account creation feel fake;
- stage two stacks a hero, starter-photo rail, two fields, explanatory text, Back,
  and a primary CTA;
- stage three is a static preview card rather than a convincing generated Home;
- completion appears to jump to Home rather than preserving visual continuity;
- there is no production authentication, consent, persistence, or recovery flow.

### Home and Ride

Strengths:

- the hero and Start Ride action are currently the strongest visual hierarchy in the
  app;
- full-height Ride Mode is cinematic, focused, and more native-feeling than the tab
  screens;
- the three-phase ride flow and recap handoffs create a coherent daily loop.

Problems:

- Home still asks the user to process hero, weekly rhythm, next care, and social
  activity at once;
- `Weekly rhythm` is an invented percentage rather than a transparent factual value;
- Recap shows a rhythm percentage without sensor or annotation data;
- care and social modules compete with the one useful next action;
- one hero image is repeated through onboarding, Home, Ride, Profile, and lessons;
- the dock can cover the bottom of scroll content.

### Horse

Strengths:

- the horse identity header is calm and easy to scan;
- Overview, Nutrition, Health, and Docs are understandable domains;
- nutrition introduces useful daily actions.

Problems:

- top-level tabs plus four Horse sub-tabs produce nine visible navigation choices;
- `Current`, `sync`, `add`, and `3 saved` do not tell the rider what happened or when;
- Passport, Vet, and Labs actions mostly increment counters or show a status message;
- records lack dates, providers, documents, notes, edit, undo, and empty/error states;
- nutrition uses fixed demo amounts without source, editability, provenance, or horse
  suitability context;
- health repeats `Health journal` and `Health timeline` but does not provide a real
  timeline;
- the dock obscures lower nutrition and record content on smaller screens.

### Club

Strengths:

- composer, stories, and one editorial post create a recognizable social surface;
- photography and spacing are calmer than earlier dashboard versions.

Problems:

- composer, camera, stories, comments, post menu, and Share mostly trigger a toast;
- there is no real compose, post detail, comments, profiles, circle membership,
  report, block, or moderation journey;
- the feed uses one seeded post, so it feels staged rather than alive;
- reactions are global counters, not user-specific persisted actions;
- the app visually implies a social network before supporting social trust.

### Academy and Ralf

Strengths:

- `For You`, `Lessons`, and `Coach` is the right internal architecture;
- personalized lesson ordering by level, discipline, and focus is a useful base;
- lesson detail is focused and visually strong;
- Ralf is more human and contextual than a generic AI Assistant label.

Problems:

- the same few images recur across many lessons;
- lesson progress is local state and does not survive reload;
- Ralf's chat creates a large empty region above short conversations;
- confidence labels repeat on nearly every message and become visual noise;
- generic prompts can return the same plan repeatedly;
- deterministic keyword replies are presented with `high confidence` too easily;
- Ralf does not yet reference a trustworthy history, evidence, source, or user-editable
  memory;
- the interface calls Ralf an AI Coach even though there is no proprietary coaching
  model or production AI service.

### Shop

Strengths:

- buyer and seller modes are visually separated;
- browse, product, protection, orders, messages, and seller dashboard routes exist;
- the product page communicates condition, seller verification, and buyer protection.

Problems:

- the fit percentage is calculated mostly from listing metadata and not from the
  selected horse, yet is shown as a precise match for that horse;
- product photos dominate the first viewport while fit and purchase actions can sit
  under the floating dock;
- checkout has no address, payment method, shipping price, tax, consent, or provider;
- `Confirm purchase` simulates an order locally;
- `List an item` instantly creates a fixed demo listing instead of opening a listing
  flow;
- seller inventory mirrors much of the public catalogue and feels artificial;
- protected payment, escrow, shipping, inspection, and dispute language implies live
  infrastructure that does not exist.

### Profile and Account

Strengths:

- the primary horse presentation is visually clear.

Problems:

- Profile is actually a second horse-record screen, not an account center;
- Add Horse only increments a number and does not create a horse;
- there is no account identity edit, preferences, notifications, privacy, support,
  subscription, sign out, or account deletion;
- records are duplicated between Horse and Profile.

## 4. Product Psychology Contract

Design for healthy repeat use, not compulsion.

Every meaningful loop must support:

- Competence: show the rider what they completed and what changed, using factual data.
- Autonomy: offer a clear primary action, a quiet alternative, edit, undo, and exit.
- Relatedness: connect the rider to their horse, coach, and trusted circle without
  social pressure.
- Trust: explain why a recommendation exists and distinguish facts from guidance.

Do not use:

- streak anxiety;
- fake urgency;
- random rewards;
- invented percentages;
- notification bait;
- empty gamification;
- false social proof;
- unsupported health, fit, performance, or AI claims.

The desired return reason is: `Equina knows what is useful for me and my horse today.`

## 5. Experience Laws

1. One screen has one primary job.
2. One viewport has one visually dominant action.
3. Home exposes one next action, not the entire product.
4. Summary comes before detail; detail appears on demand.
5. Every visible metric states its source or is removed.
6. Every button navigates, opens a focused surface, or changes durable state.
7. No action is considered complete without loading, success, error, and recovery.
8. Navigation preserves context and Back always returns predictably.
9. Mobile safe areas, keyboard, and one-handed use are product requirements.
10. Beauty never hides the next action or creates false credibility.

## 6. Visual System Contract

Use `docs/EQUINA_DESIGN_CONTRACT.md` and
`docs/EQUINA_INTERACTION_CONTRACT.md` as authoritative, then remove implementation
drift in touched surfaces.

### Typography

- only weights `400` and `600`;
- no more than five semantic type styles: display, title, body, label, meta;
- no viewport-based font scaling;
- no negative letter spacing;
- avoid all-caps except short factual eyebrows;
- long horse, rider, lesson, coach, product, and location names must wrap safely.

### Spacing and Shape

- spacing: `4, 8, 12, 16, 24, 32, 40` only;
- radii: `8, 14, 18` only, excluding true circles;
- minimum tap target: `44x44`;
- no decorative outlines;
- no cards inside cards;
- no page sections styled as floating cards;
- use separators, spacing, typography, and image planes before adding containers.

### Color and Material

- one base, one raised surface, one temporary material, and one media overlay role;
- brass is for selection, progress, and the primary action, not decoration everywhere;
- pine communicates calm completion or care, not every secondary action;
- glass is limited to the floating dock, composer, sheets, and temporary controls;
- never place glass inside glass;
- ensure contrast works over every photograph and in Reduce Transparency mode.

### Photography

- photography must reveal actual riding, care, gear, coaches, or horses;
- do not repeat one image on adjacent screens unless it is an intentional transition;
- build a discipline image set with distinct Home, Club, Academy, coach, and horse
  profile roles;
- crop for the subject and action, not atmosphere;
- provide local fallbacks for every critical hero;
- record source and license in `docs/IMAGE_CREDITS.md`.

### Icons

- use familiar Lucide icons for universal actions;
- use the bespoke horseshoe only for Horse;
- no generic icon tiles when the symbol can stand alone;
- icon-only buttons require a tooltip on web and an accessibility label everywhere;
- selected dock items use tint, label emphasis, and a tiny optical lift only.

## 7. Motion Contract

Motion explains continuity and state. It does not decorate idle screens.

- press in: `90ms`;
- release: `120ms`;
- navigation/state transition: `220-280ms`;
- completion: approximately `450ms`;
- use controlled easing and restrained travel of `4-8px`;
- use one success haptic for ride, lesson, upload, post, and purchase completion;
- use selection haptics for selectors and tabs;
- no looping glow, pulse, shimmer, or ambient movement after loading;
- no layout jumps when labels, loading states, or keyboard visibility change;
- Reduce Motion removes transforms and keeps short opacity changes;
- Reduce Transparency replaces glass with one opaque material.

Onboarding to Home must preserve the selected discipline or horse image as a visual
anchor. It must not merely swap two full-screen layers.

## 8. Copy Contract

Use plain, specific English. Younger riders should understand it without making the
product childish.

Remove vague states such as:

- `Ready`;
- `Current`;
- `sync`;
- `add`;
- `opened`;
- `progress moved forward`.

Replace them with factual states such as:

- `Farrier due Aug 14`;
- `Vet check saved today`;
- `Passport missing`;
- `2 of 3 meals logged`;
- `Lesson 2 of 5 completed`.

Recommendation copy must answer one of these questions in one sentence:

- Why this now?
- What should I do?
- What should I notice?
- When should I ask a human professional?

## 9. Personalization Contract

Personalization changes hierarchy, language, recommendations, and imagery. It does
not simply insert the rider's name into generic copy.

### By Rider Level

- Beginner: confidence, safety, one cue, short sessions, definitions, and recovery.
- Intermediate: rhythm, repeatability, one measurable observation, and short review.
- Advanced: precision, comparison between quality repetitions, workload balance.
- Pro: competition intent, marginal gains, concise plans, recovery protection.

### By Discipline

- Jumping: line, canter, rhythm, confidence, poles, recovery after efforts.
- Dressage: contact, straightness, transitions, balance, suppleness.
- Eventing: fitness, terrain, balance, recovery, discipline switching.
- Trail or endurance: calm forward rhythm, terrain, hydration, recovery.

### By Horse Context

Use only factual state the rider supplied or logged:

- identity and measurements;
- recent sessions and rider notes;
- care and record dates;
- nutrition entries and their source;
- tack metadata;
- coach annotations.

Never infer pain, lameness, gait quality, saddle fit, mood, or recovery from a photo,
timer, or generic profile.

## 10. Role of Each Top-Level Tab

### Home

Job: answer `What is the one useful thing for us now?`

Home is a state machine, not a fixed dashboard:

- first session: orient and propose one low-friction ride;
- pre-ride: one plan and one Start action;
- ride active: full-height Ride Mode;
- post-ride: factual recap and one reflection;
- care due: care action can replace the ride action;
- recovery day: quiet plan and no pressure to train;
- no horse: create/import horse, not generic content.

At most one compact progress signal and one social signal may appear below the
primary action.

### Horse

Job: maintain the trusted record and daily care context for the selected horse.

Use a horse switcher and a timeline-first model. Overview shows identity, next care,
latest ride, and latest record. Nutrition, Health, and Documents are focused routes,
not four dashboard panels.

Records require real create, view, edit, delete, attachment, date, provider, note,
reminder, error, and empty states before they are called functional.

### Club

Job: let trusted equestrians share progress, ask, respond, and support each other.

Required foundation before growth decoration:

- compose post;
- attach photo or ride;
- post detail;
- comments and reactions;
- profiles and circles;
- report, block, and moderation states;
- loading, empty, failure, and offline behavior.

Do not increase feed density until these flows work.

### Academy

Job: turn recent rider-horse context into the next useful lesson or conversation.

- `For You`: one recommendation and a short path;
- `Lessons`: searchable library;
- `Coach`: Ralf, a contextual training assistant.

Ralf may help plan, recap, explain, and prepare questions. Until proprietary labeled
coaching data exists, market Ralf as guidance, not autonomous coaching. Confidence
must reflect available data, not keyword matching.

### Shop

Job: help riders inspect and exchange gear with truthful trust signals.

Buyer and seller states remain separate. A real listing flow, product inspection,
message flow, checkout boundary, order state, and dispute state must exist before
transaction language is enabled.

Never show a precise horse fit percentage unless the scoring model uses validated
horse and item measurements and explains confidence. Prefer `Worth inspecting`,
`More measurements needed`, or `Ask a saddler`.

### Account

Profile access opens an account center, not a duplicate horse dashboard. It owns:

- rider identity and discipline preferences;
- horse management entry;
- notifications;
- privacy and data controls;
- support;
- subscription;
- sign out;
- delete account.

Do not add Account as a sixth dock item. Keep it behind the profile control.

## 11. Button and Utility Contract

Before implementing a screen, create an action registry for every visible control:

| Action | Preconditions | Destination or mutation | Persisted entity | Feedback | Failure recovery | Test |
| --- | --- | --- | --- | --- | --- | --- |

A button is not complete if it only:

- increments a demo counter;
- toggles copy without a reversible state;
- displays `[Label] opened`;
- creates fixed seed data;
- claims upload, purchase, post, or verification without a workflow.

For prototype-only infrastructure, label the boundary honestly and disable production
claims. Never use visual polish to make a simulation look live.

Every mutation needs:

- disabled and loading state;
- success confirmation;
- error copy with retry;
- idempotency or duplicate protection;
- edit or undo where appropriate;
- persistence across reload for a build presented as functional.

## 12. AI, Health, Nutrition, and Fit Safety

Ralf must not diagnose, prescribe, replace a coach, or confirm equipment fit.

Every AI response carries internal metadata:

- task type;
- factual context used;
- confidence reason;
- safety class;
- escalation rule;
- model/provider version when a live provider exists.

Show confidence to users only when it helps a decision. Do not repeat `high
confidence` on every bubble.

Health alerts say `consider a vet review` and show which rider-entered observations
triggered the suggestion.

Nutrition plans require a named source such as owner, vet, nutritionist, or stable.
Equina can log and remind; it cannot present generic demo quantities as a recommended
feeding plan.

Saddle fit is preliminary screening. It requires structured horse measurements,
saddle metadata, confidence, missing data, and a qualified saddler escalation.

## 13. Engineering Contract

- do not add more feature code to the 14,000-line `App.tsx`;
- extract only the active sprint's screen, hook, state model, and styles;
- keep component boundaries aligned to product routes, not visual fragments;
- preserve existing test IDs or update tests intentionally in the same change;
- preserve existing behavior outside active sprint scope;
- do not introduce a global state library solely to avoid prop drilling;
- keep services provider-agnostic and inject persistence/network adapters;
- keep secrets out of the client bundle;
- enforce server-side authorization for private records, posts, messages, orders,
  and seller actions;
- treat uploads as signed, validated, size-limited, and access-controlled;
- add telemetry events for task completion, failure, and abandonment, not raw health
  or message content;
- retain iOS, Android, and web compatibility.

The first production boundary should cover:

- secure auth and account deletion;
- rider and horse persistence;
- ride and care journal persistence;
- file metadata and signed uploads;
- Academy progress;
- feature flags that keep Club posting and Shop transactions read-only until their
  backend and safety requirements pass.

## 14. Sprint Program

### Sprint 0 - Product Truth and Experience Foundation

Goal: stop system drift and remove deceptive utility before another visual redesign.

Deliver:

1. Inventory every route, action, state, metric, and production claim.
2. Create an action registry and mark each action `real`, `local prototype`, `dead`,
   `unsafe claim`, or `blocked by backend`.
3. Replace invented rhythm and saddle-fit percentages with truthful language.
4. Consolidate touched colors, typography, spacing, radii, button states, icon
   controls, input states, sheets, and safe-area spacing into primitives.
5. Make the floating dock reserve enough bottom content inset on every route.
6. Define loading, empty, error, offline, and permission states for later sprints.
7. Add a feature-flag policy for Club posting and Shop transactions.
8. Create visual regression fixtures for the three target iPhone sizes.

Do not redesign all tab content in Sprint 0.

Exit criteria:

- no unsupported percentage is visible;
- no CTA claims to upload, add, post, buy, or list when it only changes demo state;
- all touched surfaces use the token and primitive contract;
- dock never obscures the final actionable row;
- action registry and screenshots are committed as artifacts;
- typecheck, tests, and export pass.

### Sprint 1 - Adaptive Home and Factual Ride Journal

Goal: make the daily rider-horse loop the product's retention engine.

Deliver:

1. Home state model for first-use, pre-ride, active, post-ride, care-due, and recovery.
2. One dominant action per state.
3. Real ride entry persisted through the service boundary.
4. Factual recap: elapsed time, completed phases, rider note, horse-feel check-in.
5. Edit and delete ride entry.
6. One explainable Academy or care recommendation.
7. Distinct discipline imagery with resilient local fallbacks.

Do not add GPS, gait, biometrics, or invented quality scores.

### Sprint 2 - Horse Record and Care System

Goal: make Horse trustworthy enough to replace scattered notes and folders.

Deliver:

1. Horse list, add, edit, select primary, archive, and empty states.
2. Timeline with rides, care, vet, lab, passport, and nutrition events.
3. Real record create/view/edit/delete flows.
4. File picker, upload boundary, progress, cancel, retry, and permissions.
5. Source-aware nutrition logging and reminders.
6. Clear professional escalation and privacy treatment.

### Sprint 3 - Personalized Academy and Coach Ralf

Goal: make learning visibly relevant to the latest ride and rider level.

Deliver:

1. Persistent lesson progress and completion.
2. Explainable recommendation reasons.
3. Distinct lesson imagery and reliable video states.
4. Ralf conversation layout with no artificial dead space.
5. Context summary, editable memory, concise suggestions, and useful confidence.
6. Safety routing and provider-agnostic AI adapter.
7. Handoff from a Ralf plan into a ride and from recap back into Academy.

### Sprint 4 - Real Club Foundations

Goal: support trusted interaction before attempting feed growth.

Deliver:

1. Composer with image and ride attachment.
2. Post detail, comments, reactions, profiles, and circles.
3. Optimistic actions with rollback.
4. Report, block, moderation queue, and visible policy states.
5. Empty, loading, error, offline, and deleted-content states.

Keep public posting feature-flagged until backend authorization and moderation pass.

### Sprint 5 - Trustworthy Shop

Goal: make buyer and seller journeys complete without overclaiming infrastructure.

Deliver:

1. Category-aware listing creation with required photos and draft saving.
2. Product gallery, condition evidence, seller trust, save, and message flows.
3. Measurement-based fit screening with honest missing-data states.
4. Checkout adapter with address, payment, shipping, tax, consent, and errors.
5. Order timeline, inspection, evidence, dispute, refund, and review states.
6. Seller listings, orders, messages, payout state, and verification.

Keep transaction actions in showcase/read-only mode until a real payment provider,
webhooks, idempotency, escrow/legal model, and server authorization exist.

### Sprint 6 - Account, Backend, and Release Hardening

Goal: make the application suitable for TestFlight and staged production rollout.

Deliver:

1. Production auth, session recovery, sign out, and delete account.
2. Privacy, consent, support, notification settings, and data controls.
3. Secure persistence and server authorization.
4. Analytics with privacy-safe events.
5. Error reporting, offline strategy, and feature flags.
6. EAS iOS/Android profiles, icons, store metadata, privacy answers, and device QA.

## 15. Active Sprint Workflow

For the active sprint, follow this order:

1. Read `git status`, package/config files, contracts, active screens, services, tests,
   and current screenshots.
2. Run the existing app and exercise every active-sprint action before editing.
3. Present a concise audit with evidence and a file-level implementation plan.
4. Update or create the action registry.
5. Implement the complete active sprint without unrelated redesigns.
6. Test every success, empty, error, long-text, keyboard, and Back path.
7. Capture screenshots and inspect them visually.
8. Iterate on hierarchy, spacing, image crop, bottom insets, and motion.
9. Run typecheck, tests, web export, and relevant native checks.
10. Leave localhost running and report exact URL, changed files, tests, and known
    backend-gated limitations.

Do not ask for aesthetic approval before implementing. Use the established contract
and make a decisive first pass. Ask the user only when a missing business decision
would make implementation unsafe.

## 16. Validation Matrix

Verify at minimum:

- `375x667`;
- `393x852`;
- `430x932`;
- iOS safe areas and home indicator;
- Android navigation and keyboard resize;
- keyboard open on every input/composer;
- long rider, horse, coach, lesson, seller, product, and location names;
- Dynamic Type or system font scaling where supported;
- VoiceOver/TalkBack labels and focus order;
- Reduce Motion;
- Reduce Transparency;
- image loading, failure, and local fallback;
- loading, empty, error, offline, permission denied, and retry;
- double tap and duplicate submission;
- Back behavior from every nested route;
- final scroll item visible above the floating dock;
- no runtime console errors;
- `npm run typecheck`;
- `npm test`;
- `npm run build`;
- Expo/iOS/Android checks relevant to the active sprint.

Use screenshots and behavior, not code inspection alone, to declare success.

## 17. Definition of Premium

Premium does not mean more blur, larger photos, more cards, or more animation.

An Equina flow is premium when:

- the rider knows what to do in under two seconds;
- the app remembers what they already told it;
- the interface has one clear visual rhythm;
- every animation preserves context;
- every number can be trusted;
- every action has a complete outcome;
- the horse remains the emotional center;
- the app is quiet when there is nothing useful to say.

Do not declare an active sprint complete until it satisfies this definition and all
of its exit criteria.
