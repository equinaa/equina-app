/**
 * The launch ground and the size of the Equina medal (the app icon's symbol) on it. The native launch
 * screen (app.json splash) draws the same symbol, the same size, on the same
 * brown, so the hand-over from the system to React shows no seam.
 * assets/splash.png is a square the width of the screen with the medal's
 * diameter at LAUNCH_MARK_FRACTION of it; iOS fits it to the width and centres it.
 */
export const LAUNCH_BROWN = "#4E301B";
export const LAUNCH_MARK_FRACTION = 0.4;
