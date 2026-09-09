# Equina Design Contract

Equina's product feel is **Heritage Luxe meets Athletic Precision**: calm, cinematic, personal, fast, and visibly equestrian. Product imagery carries emotion; interface chrome stays quiet.

## Type

- Use only weights `400` and `600`.
- Use at most five semantic styles: `display`, `title`, `body`, `meta`, and `label`.
- Keep letter spacing at `0`. Let hierarchy come from size, spacing, and contrast.
- Titles wrap to two lines. Controls use dynamic fitting before truncation.

## Space And Shape

- Spacing scale: `4, 8, 12, 16, 24, 32, 40`.
- Radius scale: `8` for compact selection, `14` for controls, `18` for large media and sheets.
- Minimum interactive target: `44 x 44` points.
- Never nest cards. A screen has one dominant visual surface and quiet supporting rows.

## Surfaces And Color

1. `canvas`: app background.
2. `base`: screen frame.
3. `raised`: inputs, selectors, and secondary actions.
4. `overlay`: modal and image legibility layer.

- Ivory is primary text, brass is the single interaction accent, pine is success, and oxblood/danger is reserved for destructive or safety states.
- Outlines communicate focus or error only. They are not decoration.
- Glass is allowed only over photography or for a temporary sheet, never as the default surface.

## Motion And Haptics

- Press feedback: `90ms` in and `120ms` out, scale to `0.975`.
- Screen transition: `240ms`, fade with no more than `10px` of travel.
- Completion: `450ms`, using the selected discipline image to bridge onboarding into Home.
- Springs are reserved for direct selection and sheets. No looping ambient animation.
- Selection uses selection haptic, consequential action uses light impact, and completion uses success notification.
- Reduce Motion removes transforms and completes transitions with immediate state changes.

## Imagery

- Each discipline has a distinct action image and recognizable riding context.
- Jumping images show an actual jumping line; dressage shows arena flatwork; eventing shows cross-country; trail shows an outdoor route.
- Do not repeat the same image on adjacent stages. The only intentional repeat is the final onboarding preview into the Home hero.
- Images have a stable aspect ratio, a dark legibility scrim, and a nonblank fallback state.

## Primitives

- **Button:** one primary action per view; secondary navigation stays visually quiet.
- **Input:** raised fill, no decorative border, persistent label, native keyboard configuration.
- **Selector:** one segmented control or a small set of large visual choices; no chip clouds.
- **Sheet:** one level above the screen, radius `18`, one clear dismiss path.
- **Progress:** three quiet segments plus a text value; it never dominates the page.
- **Navigation:** familiar icon for Back, semantic accessibility label, and minimum `44px` target.

## Accessibility

- Support screen-reader roles, labels, selected/disabled states, Dynamic Type wrapping, and keyboard dismissal.
- Maintain readable contrast over imagery and never encode selection by color alone.
- Keep layout stable while images load and while the keyboard is open.
- Test at `375x667`, `393x852`, and `430x932`, including long names and Reduce Motion.
