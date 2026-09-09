# Equina Interaction Contract

Equina's controls should feel authored for riding, while remaining immediately
understandable on iPhone and Android. Custom character comes from hierarchy,
material, timing, and equestrian context, not unfamiliar symbols.

## Navigation Layer

- The five top-level destinations always remain available and labeled.
- On iOS 26+, the dock uses native clear Liquid Glass through
  `expo-glass-effect`.
- Older iOS, Android, and web use one dark material fallback through `BlurView`.
- Reduce Transparency replaces both effects with an opaque surface.
- Content scrolls beneath the dock; a restrained bottom fade protects legibility
  without turning the dock into a full-width footer.
- Selection uses only glyph tint, label emphasis, and a one-pixel optical lift.
  It never adds a halo, circle, line, or nested capsule inside the dock.
- Brass tints only the selected glyph. The entire dock is never brass-tinted.
- Badges are reserved for critical updates, never routine engagement bait.

## Symbols

- Use familiar Lucide symbols for universal actions and destinations.
- Equina-specific concepts may use a bespoke glyph, such as the horseshoe for
  Horse.
- Avoid outline-inside-outline treatments. A play action uses a solid play glyph;
  completion uses a direct check glyph.
- Dock glyphs are `22px`; compact action glyphs are `16-19px`.
- Inactive symbols use one quiet monochrome value. Active symbols add restrained
  fill and brass tint without a decorative icon tile.
- Icon-only controls require a semantic accessibility label and a `44px` target.

## Buttons

- A view has one visually dominant action.
- Primary actions use stained brass or pine; they do not use clear glass unless
  they float directly over photography.
- Secondary actions use layout and text hierarchy instead of decorative outlines.
- Primary controls are at least `56px` high; icon-only controls are at least
  `44px` square.
- Labels align with the reading direction. A trailing chevron communicates
  continuation; it is not placed in another outlined capsule.
- Use only `400` and `600` weights. Do not use uppercase copy for button labels.
- Disabled, loading, pressed, success, and error states must not resize the control.

## Motion And Haptics

- Press in: `90ms`; release: `120ms`; maximum scale change: `6%` for compact
  navigation and `2.5%` for primary actions.
- Navigation selection: `180ms` icon and label emphasis with restrained scale
  and lift.
- Selection uses selection haptic, action submission uses light impact, and ride or
  lesson completion uses success haptic.
- Reduced Motion removes transforms instead of making them instantaneous.
- No idle pulsing, looping highlights, or motion that does not explain a state
  change.

## Glass Discipline

- Glass belongs to navigation and temporary control layers, not ordinary content
  cards.
- Do not place glass inside glass.
- One subtle specular highlight is allowed on the fallback material; borders do
  not provide hierarchy.
- Tint is selective and contrast must remain readable over every tab's content.

These rules apply to every new Equina control before screen-specific decoration is
added.
