# Equina Sprint 5: Complete Product Polish and Interaction Coherence

You are Equina's principal product designer, design-systems lead, senior React
Native / Expo engineer, iOS motion designer, accessibility specialist, and mobile
UX psychologist.

Execute Sprint 5 of Equina's premium product program. Do not stop at an audit,
recommendations, a design document, or isolated mockups. Inspect the repository,
implement the complete system-wide polish, exercise every visible control, inspect
native-sized screenshots, iterate, and leave localhost running.

## Product Standard

Equina is an iOS-first equestrian companion with the product feel:

`Heritage Luxe meets Athletic Precision`

The finished product must feel calm, cinematic, personal, tactile, fast, and
unmistakably equestrian. It must not feel like a generic dark dashboard, banking
app, marketplace template, AI-generated component library, or a wall of rounded
cards.

Premium does not mean more blur, more borders, more shadows, or more animation.
Premium means ruthless hierarchy, excellent proportions, legible content,
predictable interaction, meaningful feedback, and restraint.

## Sprint Objective

Polish the complete existing product experience without adding product features.
Create one coherent visual and interaction language across:

- onboarding, authentication, and account;
- Home;
- Horse;
- Club;
- Academy, lessons, video, and Ralf;
- Shop browse, product, checkout, selling, and messaging;
- sheets, dialogs, empty states, loading states, errors, and completion states;
- the global header, floating TabDock, keyboard behavior, and screen transitions.

This is a design-system and product-coherence sprint. Preserve the purpose,
callbacks, state, backend contracts, permissions, capability flags, and test IDs of
every existing feature.

## Repository Truth

Verify these statements before editing:

- The app is React Native / Expo and targets iOS first while remaining compatible
  with Android and web.
- `src/App.tsx` still coordinates much of the product, while some features,
  backend services, primitives, motion helpers, and design tokens are extracted.
- `docs/EQUINA_DESIGN_CONTRACT.md` and
  `docs/EQUINA_INTERACTION_CONTRACT.md` are binding starting points.
- The floating dock already has native Liquid Glass support on compatible iOS
  versions and a BlurView fallback elsewhere.
- Backend capability is runtime-gated. A visually polished control must never imply
  that an unavailable server mutation succeeded.
- Local preview is not a connected account. Keep that distinction explicit.
- The worktree may contain valid user changes. Work with them and do not revert
  unrelated files.

Document any repository truth that differs before implementation. Do not create a
second theme, motion system, button system, icon system, or feature-flag system.

## Fixed Design Contract

### Typography

- Use only font weights `400` and `600`.
- Use no more than five semantic styles: `display`, `title`, `body`, `meta`, and
  `label`.
- Letter spacing is `0`, except a restrained uppercase media eyebrow where the
  existing contract explicitly allows it.
- Do not scale type with viewport width.
- Support long rider, horse, coach, product, and lesson names without clipping.
- Reduce unnecessary interface copy. Prefer a short title, one useful supporting
  sentence, and the action. Never add visible instructions that describe the UI.

### Spacing and shape

- Use only the spacing scale `4, 8, 12, 16, 24, 32, 40`.
- Use only radii `8, 14, 18`.
- Every interactive target is at least `44 x 44` points.
- Primary actions are at least `56` points high.
- Do not nest cards. Do not turn full screen sections into floating cards.
- Use whitespace, separators, alignment, and typography before adding a container.
- Keep one dominant surface and one dominant CTA per view.

### Color and material

- Preserve Equina's existing brand roles: ivory for primary text, brass for
  interaction, pine for success, and oxblood/danger only for destructive or safety
  states.
- Remove random one-off color values when a semantic theme role already exists.
- Do not use decorative outlines. Borders communicate focus, validation, or a real
  boundary only.
- Glass belongs to the floating dock, temporary sheets, contextual controls over
  photography, and selected high-value overlays.
- Never place glass inside glass. Ordinary content uses quiet canvas, base, raised,
  or image-backed surfaces.
- Reduce Transparency must replace blur and Liquid Glass with an opaque,
  high-contrast fallback.

### Imagery

- Audit every image placement and adjacent repetition.
- Use discipline-correct equestrian imagery: actual jumping lines, arena dressage,
  cross-country eventing, and real trail riding.
- Replace weak, generic, or repeatedly adjacent imagery only with optimized local
  assets that have stable crops, fallbacks, and documented credits.
- Images must reveal the horse, rider, lesson, or product clearly. Do not rely on
  dark atmospheric crops that hide the subject.
- Keep image ratios stable while loading and prevent layout shift.

## Interaction Primitives

Audit every raw `Pressable`, `TextInput`, selector, row, and sheet. Consolidate
product controls into the existing primitive layer instead of styling each screen
independently.

Implement or complete these variants only when used by an existing flow:

1. Primary button: brass or pine, one per view.
2. Secondary action: quiet filled material or text hierarchy, never a decorative
   outline.
3. Quiet action: text or icon with a full invisible hit target.
4. Destructive action: reserved danger treatment with confirmation.
5. Icon button: familiar symbol, no generic icon tile unless the surface needs one.
6. Input: persistent label, natural focus material, validation, keyboard and submit
   behavior.
7. Selector: segmented control, concise menu, or large visual choice based on the
   decision; no chip clouds.
8. List row: stable leading content, one title, optional supporting value, and
   semantic trailing affordance.
9. Sheet: one task, one dismiss path, keyboard-safe, controlled spring.
10. Status state: loading, empty, error, offline, unavailable, and success without
    pretending backend completion.

Every control must have stable dimensions and complete default, pressed, focused,
disabled, loading, success, and error states where applicable. State changes must
not resize the control.

## Icon Language

- Use familiar Lucide symbols for universal actions.
- Keep the bespoke Equina horseshoe for Horse.
- Dock icons are optically consistent at approximately `22px`; compact action icons
  are `16-19px`.
- Remove outline-inside-outline, icon circles used only as decoration, mismatched
  stroke widths, and redundant chevrons.
- Selection in the TabDock uses tint, label emphasis, and a subtle optical lift.
  Do not add a circle, halo, top line, nested pill, or brass dock background.
- Every icon-only action has an accessibility label and a `44px` target.

## Motion and Haptics

Motion explains cause and effect; it does not decorate idle screens.

- Press in: `90ms`; release: `120ms`.
- Screen transition: `220-280ms`, with opacity and at most `10px` travel.
- Completion: approximately `450ms`.
- Use controlled springs only for selectors, direct manipulation, and sheets.
- Use selection haptic for choices, light impact for consequential submissions,
  and success notification for ride, lesson, or onboarding completion.
- Respect Reduce Motion by removing transforms, not by making them flash instantly.
- No looping glow, idle pulse, animated background, bouncing CTA, or endless
  ambient motion.
- Keyboard appearance must not create clipped controls, white browser outlines,
  footer jumps, or messages hidden behind the composer.

## UX Psychology Rules

- One screen has one clear job.
- Use progressive disclosure: show the next useful decision, not every possible
  utility at once.
- Prefer recognition over recall and familiar mobile patterns over invented
  interaction.
- Preserve user context when entering and leaving nested views.
- Retention must come from meaningful riding progress, relevant learning, trusted
  social activity, and completed tasks, not fake urgency, streak anxiety, or random
  gamification.
- Never show fake live presence, fake scarcity, fake delivery, fake AI confidence,
  or fake backend success.
- Remove redundant labels, duplicated metadata, and explanatory text that does not
  change the rider's next decision.

## Screen-by-Screen Polish

### Global shell

- Normalize safe areas, headers, scroll insets, screen widths, keyboard avoidance,
  and content clearance above the floating dock.
- Keep top-level navigation stable across all five tabs.
- Nested views receive a clear back path and do not render the dock when the task is
  immersive, such as chat or checkout.
- Remove header duplication and inconsistent page-title sizing.

### Home

- Preserve Home as a personal riding briefing, not a dashboard.
- Keep one emotionally strong, discipline-correct hero and one clear ride action.
- Establish a readable order: today's plan, recent progress, next useful action,
  and at most one meaningful social signal.
- Remove visual competition, redundant status labels, decorative cards, and
  controls that belong in Horse, Academy, Club, or Shop.

### Horse

- Make the area feel like a personal horse record, not a bank vault or KPI panel.
- Prioritize horse identity, health/nutrition context, records, and the next due
  action through calm grouped rows and clear nested views.
- Riders without a horse receive rider-first language and no fake horse metrics.

### Club

- Make existing community content scan like a premium social feed, not a menu of
  utilities.
- Keep identity, media, caption, metadata, reactions, and comments in a consistent
  order.
- Existing publish and interaction capability states remain truthful and clear.

### Academy and Ralf

- Keep Lessons and Ralf conceptually distinct while visually related.
- Academy home presents two unmistakable entry points without stats clutter.
- Directory, lesson detail, video progress, and next lesson use one hierarchy.
- Ralf chat is full-height, keyboard-safe, calm, and human. Keep configuration
  secondary to the conversation.
- Composer, message bubbles, confidence/safety context, suggestions, and menus must
  use the shared interaction language and never resemble a generic AI demo.

### Shop

- Keep buyer and seller modes distinct.
- Browse follows search, filters, featured content, and a vertically scrolling
  catalog.
- Product pages prioritize real images, price, condition, fit facts, seller trust,
  shipping, protection, and one purchase action.
- Checkout, listing, orders, and messaging each have one job and honest backend
  states.
- Preserve fraud, dispute, permissions, and capability logic while polishing the
  presentation.

### Account, onboarding, and authentication

- Preserve the three-stage onboarding logic and current callback behavior.
- Keep focused fields, OTP, account mode, loading, and handoff visually consistent.
- Account uses native-feeling grouped rows instead of a card wall.
- Sign-out and destructive actions remain quiet until intentionally opened.

## Engineering Constraints

- Do not add product features, screens, tabs, a navigation library, or a global
  state library.
- Do not rewrite working backend logic or move server authority into the client.
- Preserve all test IDs exactly.
- Preserve callbacks, permissions, capability gates, secure storage, RLS
  assumptions, and account modes.
- Extract only code touched by the shared design and motion system when extraction
  materially reduces duplication.
- Do not perform unrelated refactors.
- Prefer Expo-compatible libraries already installed. Add a dependency only when it
  materially improves native behavior and cannot be achieved safely with the
  current stack.
- Keep iOS, Android, and web fallbacks explicit.
- Never hide a broken action behind animation. Every visible enabled control must
  invoke a real callback and reach a truthful result.

## Required Workflow

1. Inventory every screen, primitive, raw control, typography style, radius, color,
   icon, image, animation, and visible action.
2. Capture baseline screenshots for all top-level tabs and critical nested flows.
3. Produce a concise audit matrix with severity, repeated root cause, and the shared
   primitive or layout rule that will fix it.
4. Present a short implementation plan ordered by system leverage.
5. Fix theme roles and shared primitives first.
6. Polish the global shell and TabDock.
7. Apply the system screen by screen without changing product scope.
8. Exercise every visible control and every back path.
9. Visually inspect all required sizes and keyboard states.
10. Iterate until every exit gate passes.
11. Run validation and leave localhost active.

Do not ask for approval between ordinary implementation steps. Stop only for a
genuine product decision, missing credential, destructive migration, or external
service dependency.

## Validation Matrix

Verify at minimum:

- `375 x 667`, `393 x 852`, and `430 x 932`;
- iOS safe-area behavior and Android fallback behavior;
- keyboard-open states for onboarding, OTP, Ralf, Shop messaging, search, listing,
  and account editing;
- long rider, horse, coach, lesson, and product names;
- Dynamic Type or equivalent enlarged text stress;
- Reduce Motion and Reduce Transparency;
- image loading and fallback states;
- light/dark system setting behavior as currently supported;
- every button, icon action, selector, menu, sheet, back action, and disabled state;
- loading, empty, error, offline, unavailable, and completion states;
- no horizontal overflow, clipped text, overlapping content, layout shift, or dock
  obstruction;
- no runtime console errors;
- typecheck;
- existing tests;
- backend contract and migration tests;
- web export.

Use Playwright screenshots for web-sized native layouts and native simulator
screenshots where available. Inspect the screenshots visually; generating them is
not validation by itself.

## Exit Gates

The sprint is not complete until:

- there are zero font weights outside `400` and `600`;
- there are zero interactive targets below `44 x 44`;
- there are zero random radii outside `8`, `14`, and `18`;
- there are zero decorative outlined buttons;
- there are zero nested cards;
- there are zero adjacent screens reusing the same hero image without intent;
- there are zero visible enabled controls without a working callback;
- there are zero fake success, presence, availability, or backend claims;
- every major view has at most one visually dominant CTA;
- every interactive control has stable pressed and disabled behavior;
- every scroll view clears the floating dock and every composer clears the keyboard;
- all required tests, typecheck, and web export pass;
- localhost returns `200` and the final URL is reported.

## Delivery

Report:

1. the audit's highest-impact root causes;
2. the shared primitives and tokens changed;
3. the screen-by-screen polish completed;
4. the interaction and accessibility defects fixed;
5. validation results and screenshot locations;
6. remaining product limitations caused by missing backend credentials or external
   services, without presenting them as completed.

Do not claim "premium", "native", "secure", "functional", or "finished" based on
appearance alone. Prove each claim through the exit gates above.
