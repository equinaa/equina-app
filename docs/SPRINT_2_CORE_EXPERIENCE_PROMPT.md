# Equina Sprint 2: Core Riding Experience

You are Equina's principal product designer, senior React Native / Expo engineer,
motion designer, and mobile behavioral UX lead.

Execute Sprint 2 of Equina's premium redesign. Do not stop at recommendations.
Inspect, implement, test, visually review, iterate, and leave localhost running.

## Product Intent

Equina is a premium, iOS-first equestrian companion: Heritage Luxe meets Athletic
Precision. It should feel personal, cinematic, calm, fast, and unmistakably built
around the relationship between one rider and one horse.

The app must stop feeling like five tabs containing cards. The core experience is a
daily riding loop that changes state with the rider:

`Home briefing -> Ride Mode -> Ride Recap -> Academy recommendation or Club share`

This loop becomes the experience standard for later Horse, Academy, Club, and Shop
sprints.

## Sprint Scope

Work only on:

1. The Home pre-ride state.
2. A focused, full-height Ride Mode.
3. A focused post-ride Recap.
4. Contextual handoffs from Recap into Academy and Club.
5. Motion, haptics, accessibility, and responsive behavior for this journey.

Do not redesign Horse, the Academy directory/chat, Club feed, Shop, Profile, or
onboarding in this sprint. Preserve their current behavior and visual structure.

## Experience Rules

### Home Briefing

- Home shows the rider's one most useful next action.
- Keep the horse image and personalized discipline plan dominant.
- Keep weekly rhythm compact and subordinate.
- Show at most one care action and one social signal.
- Starting a ride must enter a distinct experience, not change copy inside the card.
- There is one primary CTA: Start ride.

### Ride Mode

- Ride Mode fills the app frame and hides normal headers, scrolling content, and tabs.
- Show elapsed time, horse, discipline, current phase, and one short riding cue.
- Use three phases: warm-up, focus work, and cool-down.
- Let the rider advance phases manually with one clear control.
- Preserve `testID="ride-toggle"` on the finish action.
- Use local UI state for elapsed time and phase; do not introduce backend claims,
  fake GPS, fake biometric data, or medical guidance.
- Finishing the ride uses the existing ride callback and existing session state.

### Ride Recap

- Recap is a distinct completion screen, not another Home card.
- Show a calm completion moment, then the useful summary.
- Let the rider select how the horse felt using the existing mood values.
- Show only three factual summary values already supported by the app.
- Give one contextual Academy recommendation based on discipline and level.
- Primary CTA opens that recommendation in Academy.
- Secondary action shares the ride to Club using the existing share callback.
- A quiet Home action dismisses Recap without losing the saved session.

## Visual Contract

- Use only font weights `400` and `600`.
- Use no more than five semantic type styles.
- Use the spacing scale `4, 8, 12, 16, 24, 32, 40`.
- Use only radii `8, 14, 18`.
- One dominant visual surface per state.
- No cards inside cards, decorative outlines, chip clouds, generic icon containers,
  ambient loops, or competing CTAs.
- Photography carries emotion; interface chrome remains quiet.
- Do not repeat the same photograph on adjacent states unless it is an intentional
  visual handoff from Home into Ride Mode.
- Keep every tap target at least 44 points.

## Motion Contract

- Press response: `90-120ms`.
- State transition: `220-280ms`.
- Completion: approximately `450ms`.
- Use movement to explain state changes, not decorate idle screens.
- Home image may bridge into Ride Mode through a restrained scale/crossfade.
- Ride completion should settle into Recap with one success haptic.
- Use controlled easing, not long bouncy springs.
- Respect Reduce Motion by removing transforms and completing state transitions
  immediately or with a short opacity change.
- Avoid web compositor artifacts; use native transforms only where supported.

## Behavioral Principles

- Competence: make progress legible without artificial XP.
- Autonomy: always provide a quiet exit from Ride Mode and Recap.
- Relatedness: Club sharing is optional and never blocks saving.
- No streak anxiety, random rewards, false urgency, or dark patterns.
- Every sentence must help the rider make a decision.

## Engineering Constraints

- Inspect the repository before editing.
- Preserve current account, onboarding, horse, marketplace, community, Academy,
  nutrition, and profile behavior.
- Preserve all existing test IDs and callbacks.
- Reuse `rideActive`, `lastRideRecapVisible`, `dailyMood`, `sessionCount`,
  `focusProgress`, Academy state, and current share logic.
- Add only local UI state required for elapsed time and phase progression.
- Do not add a navigation or global state library.
- Extract only touched ride-experience code when it materially reduces App.tsx
  complexity; do not perform unrelated refactors.
- Keep iOS, Android, and web compatibility.

## Validation

Verify the complete flow at `375x667`, `393x852`, and `430x932`:

1. Home -> Start ride.
2. Advance every Ride Mode phase.
3. Finish -> Recap.
4. Change horse feeling.
5. Recap -> Academy recommendation.
6. Recap -> Club share.
7. Recap -> Home.
8. Long rider and horse names.
9. Reduce Motion behavior.
10. Runtime console errors.
11. Typecheck and existing tests.
12. Web, iOS, and Android exports.

Do not declare the sprint complete until the journey is visually coherent,
functionally intact, and usable with one hand on a small iPhone.
