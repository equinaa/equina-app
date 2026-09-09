# Equina Sprint 3: Personalized Academy + Equina Guide

You are Equina's principal product designer, senior React Native / Expo engineer,
learning-experience designer, motion designer, and mobile behavioral UX lead.

Execute Sprint 3 of Equina's premium redesign. Do not stop at recommendations.
Inspect, implement, test, visually review, iterate, and leave localhost running.

## Product Intent

Equina is a premium, iOS-first equestrian companion: Heritage Luxe meets Athletic
Precision. Academy must feel like a private learning path for one rider and one
horse, not a content catalogue with a chatbot attached.

The Academy experience continues the core riding loop:

`Ride Recap -> relevant lesson -> apply it next ride -> ask Guide in context`

Every recommendation must be explainable from data already present in the app:
discipline, rider level, current focus, recent ride count, care status, and selected
lesson. Never imply that video, sensor, gait, or health analysis happened when it did
not.

## Sprint Scope

Work only on:

1. Academy `For you` home.
2. The lesson directory hierarchy.
3. Lesson video details and completion handoff.
4. Equina Guide entry, context editing, chat, and lesson handoff.
5. Motion, haptics, accessibility, and responsive behavior for these journeys.

Do not redesign Home, Ride Mode, Ride Recap, Horse, Club, Shop, Profile, or
onboarding. Preserve their current behavior and visual structure.

## Experience Architecture

Keep one Academy tab with three quiet internal destinations:

- `For you`: the next useful lesson and a short personal path.
- `Lessons`: the searchable library.
- `Guide`: contextual planning and reflection assistance.

These destinations must feel related but never appear as three competing products.

## For You

- Lead with one sentence that says why today's recommendation is relevant.
- Show one dominant lesson with real equestrian photography, coach, duration, and
  progress.
- Use rider level, discipline, current focus, and recent ride context in the reason.
- Show at most two lessons after the recommendation as a quiet numbered sequence.
- Keep the full directory as a secondary text action, not a competing button.
- End with one contextual Guide action tied to the current lesson or latest ride.
- Do not show dashboards, stat blocks, chip clouds, multiple cards, or generic
  motivational copy.

## Lesson Directory

- Keep search immediately available.
- Keep topic filtering, but render it as quiet navigation rather than a cloud of
  outlined pills.
- Rank results using the existing personalization logic.
- Give one result visual priority; render the rest as efficient media rows.
- Empty search state must make recovery obvious.
- Preserve all existing lesson and filter test IDs.

## Lesson Page

- Keep the video as the dominant surface.
- Show title, coach, concise lesson purpose, path progress, and one completion CTA.
- Completion advances to the next personalized lesson when one exists.
- Provide one quiet handoff to Guide so the rider can ask about the open lesson.
- Do not add chapters, comments, ratings, downloads, or unsupported media features.
- Preserve `academy-video-back` and `academy-video-complete`.

## Equina Guide

- Show value before configuration. The first Guide view presents the rider and horse
  context plus three concrete starting needs: plan the next ride, review the last
  ride, or understand an exercise.
- Starting from one of these needs opens the conversation and sends that prompt.
- Keep a quiet primary action for opening Guide without a starter prompt.
- Move focus and weekly load selectors behind `Adjust context`; do not ask for them
  before the first useful interaction.
- Chat occupies the available Academy height. No lesson feed or setup content remains
  visible behind it.
- Suggestions are compact action rows, not a three-card dashboard.
- Assistant messages may show concise confidence context; user messages remain
  visually distinct.
- Keep the composer reachable with the keyboard open and keep send at least 44 points.
- Health and welfare questions must remain guidance-only and escalate to a coach or
  veterinarian.
- Never market this surface as diagnosis, automated coaching, or sensor analysis.

## Personalization Rules

- Beginner: confidence, simple cues, short exercises, plain language.
- Intermediate: rhythm, repeatability, one measurable focus, short debrief.
- Advanced: precision, comparison between quality repetitions, workload awareness.
- Pro: competition intent, marginal gains, recovery protection.
- Discipline changes the recommended imagery, lesson ranking, language, and prompts.
- Horse context uses only existing factual state: name, ride count, and care log.
- Keep recommendation reasons to one sentence and never expose ranking mechanics.

## Visual Contract

- Follow `docs/EQUINA_DESIGN_CONTRACT.md`.
- Use only font weights `400` and `600`.
- Use at most five semantic type styles.
- Use spacing `4, 8, 12, 16, 24, 32, 40` and radii `8, 14, 18`.
- One dominant media surface per view.
- No cards inside cards, decorative outlines, generic icon containers, chip clouds,
  oversized headers, or competing calls to action.
- Photography carries emotion; interface chrome remains quiet.
- Every tap target is at least 44 points.

## Motion Contract

- Press response: `90-120ms`.
- Academy destination transition: `220-280ms`.
- Lesson completion: approximately `450ms` with one success haptic.
- Use motion only to preserve context between recommendation, lesson, and Guide.
- Native may use up to `6px` of vertical travel; web uses opacity only.
- Respect Reduce Motion and avoid layout shifts or looping decoration.

## Engineering Constraints

- Inspect the repository before editing.
- Preserve all existing callbacks, state values, and test IDs.
- Reuse rider, horse, Academy, and Guide state already held in `App`.
- Add only local UI state needed to reveal context editing.
- Do not add a navigation library, global state library, AI provider, backend, or new
  product feature.
- Do not perform unrelated refactors.
- Keep iOS, Android, and web compatibility.

## Validation

Verify at `375x667`, `393x852`, and `430x932`:

1. Academy opens on one personalized recommendation.
2. Recommended lesson opens and plays without a blank frame.
3. Completing a lesson advances progress and opens the next lesson.
4. Directory search, clear, and every topic filter work.
5. Guide opens from each starter need and sends the correct prompt.
6. Guide context can be edited and saved.
7. Chat suggestions, free text, and send work with the keyboard open.
8. Ride Recap still opens the recommended Academy lesson.
9. Long rider, horse, lesson, and coach names wrap safely.
10. Reduce Motion removes transforms.
11. Runtime console has no errors.
12. Typecheck, existing tests, and web/iOS/Android exports pass.

Do not declare the sprint complete until Academy feels like a coherent personal
learning journey and Guide feels useful before it asks the rider to configure it.
