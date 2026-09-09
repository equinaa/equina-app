export const equinaTheme = {
  colors: {
    ivory: "#F7F3EA",
    parchment: "#E8DDC8",
    ink: "#161512",
    graphite: "#3D3C38",
    brass: "#C4A05A",
    oxblood: "#5B2028",
    pine: "#183B32",
    mist: "#EEF1EF",
    danger: "#9D2B2E"
  },
  surfaces: {
    canvas: "#080706",
    frame: "#0E0D0B",
    raised: "#171511",
    elevated: "#201D17",
    glass: "rgba(20,18,15,0.68)",
    glassStrong: "rgba(14,13,11,0.9)"
  },
  text: {
    primary: "#F7F3EA",
    secondary: "rgba(247,243,234,0.72)",
    tertiary: "rgba(247,243,234,0.46)",
    inverse: "#161512"
  },
  colorRole: {
    accent: "#C4A05A",
    positive: "#315B4D",
    critical: "#9D2B2E",
    focus: "#F7F3EA"
  },
  surfaceRole: {
    canvas: "#080706",
    base: "#0E0D0B",
    raised: "#171511",
    overlay: "rgba(14,13,11,0.92)"
  },
  material: {
    quiet: "rgba(247,243,234,0.055)",
    quietPressed: "rgba(247,243,234,0.09)",
    selected: "rgba(196,160,90,0.18)",
    fieldFocused: "rgba(196,160,90,0.1)",
    separator: "rgba(247,243,234,0.08)",
    dockFallback: "rgba(20,18,15,0.92)"
  },
  radius: {
    compact: 8,
    control: 14,
    card: 18,
    sheet: 18,
    hero: 18,
    pill: 18
  },
  spacing: {
    xs: 4,
    sm: 8,
    compact: 12,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 40
  },
  typography: {
    display: { fontSize: 32, lineHeight: 38, fontWeight: "600" as const },
    title: { fontSize: 22, lineHeight: 28, fontWeight: "600" as const },
    body: { fontSize: 16, lineHeight: 22, fontWeight: "400" as const },
    meta: { fontSize: 13, lineHeight: 18, fontWeight: "400" as const },
    label: { fontSize: 12, lineHeight: 16, fontWeight: "600" as const }
  },
  motion: {
    pressIn: 90,
    pressOut: 120,
    transition: 240,
    completion: 450
  },
  accessibility: {
    minimumTapTarget: 44
  }
} as const;
