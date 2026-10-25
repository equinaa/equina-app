import { useId } from "react";
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, RadialGradient, Stop } from "react-native-svg";

/**
 * The streak's flame: three layers, from brass at the edge to warm ivory at
 * the core, the yard's colours rather than a fitness app's blue. `muted` is
 * a flame not lit yet (a milestone still to come); `glow` puts the soft halo
 * behind it on the streak screen.
 */
export function StreakFlame({ size, muted = false, glow = false }: { size: number; muted?: boolean; glow?: boolean }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const outer = muted ? ["#55524B", "#2E2C28"] : ["#EBCB86", "#9A7434"];
  const middle = muted ? ["#6B675F", "#3E3B36"] : ["#F6E2AE", "#C9A35C"];
  const inner = muted ? ["#8A867D", "#57534C"] : ["#FFF8E8", "#F3DCA2"];
  // The halo needs room around the flame; without it the drawing is the flame alone.
  const viewBox = glow ? "-40 -30 180 190" : "8 0 84 130";
  const height = glow ? size * (190 / 180) : size * (130 / 84);

  return (
    <Svg width={size} height={height} viewBox={viewBox} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Defs>
        <RadialGradient id={`${id}glow`} cx="50" cy="82" r="88" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#C4A05A" stopOpacity="0.42" />
          <Stop offset="0.55" stopColor="#C4A05A" stopOpacity="0.1" />
          <Stop offset="1" stopColor="#C4A05A" stopOpacity="0" />
        </RadialGradient>
        <LinearGradient id={`${id}outer`} x1="50" y1="4" x2="50" y2="126" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={outer[0]} />
          <Stop offset="1" stopColor={outer[1]} />
        </LinearGradient>
        <LinearGradient id={`${id}middle`} x1="50" y1="40" x2="50" y2="120" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={middle[0]} />
          <Stop offset="1" stopColor={middle[1]} />
        </LinearGradient>
        <LinearGradient id={`${id}inner`} x1="50" y1="78" x2="50" y2="118" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={inner[0]} />
          <Stop offset="1" stopColor={inner[1]} />
        </LinearGradient>
      </Defs>
      {glow && !muted ? (
        <>
          <Circle cx="50" cy="82" r="88" fill={`url(#${id}glow)`} />
          <Ellipse cx="30" cy="10" rx="1.6" ry="3.2" fill="#EBCB86" opacity="0.7" />
          <Ellipse cx="74" cy="22" rx="1.2" ry="2.6" fill="#EBCB86" opacity="0.55" />
          <Ellipse cx="62" cy="-6" rx="1" ry="2.2" fill="#F6E2AE" opacity="0.45" />
        </>
      ) : null}
      <Path
        d="M50 4 C58 26 86 42 86 78 C86 106 68 126 50 126 C32 126 14 106 14 78 C14 58 26 46 32 34 C34 48 40 56 46 58 C44 40 44 20 50 4 Z"
        fill={`url(#${id}outer)`}
      />
      <Path
        d="M50 40 C56 56 72 66 72 88 C72 108 62 120 50 120 C38 120 28 108 28 90 C28 78 36 70 40 62 C42 72 46 78 50 80 C48 66 46 54 50 40 Z"
        fill={`url(#${id}middle)`}
      />
      <Path
        d="M50 78 C55 88 62 94 62 104 C62 113 57 118 50 118 C43 118 38 113 38 105 C38 97 45 90 50 78 Z"
        fill={`url(#${id}inner)`}
      />
    </Svg>
  );
}
