# Equina Product Blueprint

## Product Direction

Equina is a **global equestrian mobile app**, not a commerce-first product. The product center is the rider-horse relationship: training, care, progress, community, coach collaboration, education, and gear management.

Gear discovery and trusted resale remain useful, but they are a module inside the broader equestrian operating system. The first screen should feel like a rider's daily home base, not a classifieds feed.

## Wedge

**Wedge: AI-assisted training and horse-care journal.**

This is the strongest worldwide wedge because every rider can use it before network effects exist. It creates retention through daily/weekly session logging, horse care notes, AI summaries, coach feedback, and progress history. Gear, community, and education support the wedge by adding context around tack fit, training goals, rider questions, and coach collaboration.

## Geography

**Launch geography: worldwide, English-first.**

Worldwide launch means the app should avoid local-only logistics, local currency assumptions, and region-specific language in the core experience. Payments and trusted resale can support EUR, USD, and GBP first, with additional currencies later.

## Business Model

**Primary monetization: subscription.**

Equina should monetize as `Equina Plus` for serious riders and `Coach Pro` for trainers. Trusted resale fees, education, and transaction services are secondary because the product is not centered on commerce.

Ranked models:

1. Subscription: primary; aligns with training, care, AI, and coach collaboration.
2. Trusted resale fee: secondary; useful when gear transactions happen.
3. Premium education: secondary; supports training goals.
4. Listing or transaction fees: tertiary; avoid making the app feel sales-first.

## AI Positioning

Equina should launch as **AI Assistant**, not autonomous AI Coach. It can summarize sessions, detect workload patterns, suggest plans, recommend educational content, and flag health patterns for vet review. It must not diagnose, replace a coach, or make unsupported medical/safety claims.

The AI moat should be built from structured session logs, horse profiles, tack fit history, coach annotations, care notes, and optional labeled riding clips. Until the app has enough proprietary labeled data, AI should be presented as assistance with confidence labels.

## Core Modules

- **Home:** daily riding plan, horse status, recent progress, AI prompts.
- **Stable:** horses, health notes, tack inventory, measurements.
- **AI Assistant:** session summaries, workload patterns, plan suggestions, safety-aware guidance.
- **Community:** discipline spaces, coach Q&A, training journals, local/global groups.
- **Gear:** tack inventory, saddle fit context, trusted resale as optional flow.
- **Profile:** identity, preferences, subscriptions, coach/rider roles.

## MVP Scope

MVP should include:

- Auth/session model.
- Rider profile.
- Horse CRUD.
- Training/session journal.
- Basic care notes.
- AI Assistant service layer with safety labels.
- Tack inventory and gear discovery demo.
- Community post CRUD.
- Coach Q&A placeholder.

Do not make commerce the main product surface.

## Cut From MVP

- Full logistics/shipping automation.
- Complex resale dispute operations.
- Club admin.
- Video biomechanics AI.
- Full event/contest history.
- Paid live lesson booking.
- Multi-language expansion beyond English.

These can come later after the daily training/care loop proves retention.
