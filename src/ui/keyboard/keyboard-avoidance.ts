// Keyboard avoidance for Android, kept free of React Native so it can be
// tested in Node.
//
// Why Android needs its own: the app targets Android 16 and runs edge to edge,
// so the window no longer shrinks when the keyboard opens (the platform's
// Window.setDecorFitsSystemWindows: with false "the framework will not fit the
// content view to the insets", and an app targeting Android 15 or later always
// behaves that way). React Native 0.83's KeyboardAvoidingView then has two
// Android faults:
// - keyboardDidHide carries a wrong screenY, so a view that reaches the bottom
//   of the screen keeps a gap as tall as the system bars after the keyboard
//   closes (fixed upstream only in 0.86, facebook/react-native#55855);
// - it measures itself from its parent, not from the screen, so a screen
//   inside the safe area is lifted too little, by the status bar's height.
//
// So: when the keyboard opens, measure where the view ends on screen and pad
// it by the part the keyboard covers; when it closes, no padding. If the
// window does shrink after all, the view then ends above the keyboard, the
// overlap is 0, and nothing is added twice.
//
// "On screen" is measure()'s pageY, not measureInWindow: in React Native 0.83
// measureInWindow adds the root's viewport offset (RootViewUtil, the root's
// position minus the visible frame's top), which edge to edge is minus the
// status bar in the main window and nothing inside a Modal. pageY leaves it
// out, and both root views start at the top of the screen, as screenY does.

/** A view's vertical extent from the top of its root view (measure's pageY). */
export type WindowFrame = { y: number; height: number };

/** How much of the view the keyboard covers, in the same units as the frame. */
export function keyboardOverlap(
  frame: WindowFrame | null | undefined,
  keyboardTop: number | null | undefined
): number {
  if (!frame || keyboardTop == null || !Number.isFinite(keyboardTop)) return 0;
  const bottom = frame.y + frame.height;
  if (!Number.isFinite(bottom)) return 0;
  return Math.max(0, Math.round(bottom - keyboardTop));
}

export type KeyboardAvoider = {
  /** keyboardDidShow: the keyboard's top edge from the top of the screen (endCoordinates.screenY). */
  show(keyboardTop: number): void;
  /** keyboardDidHide. Its coordinates are not read: React Native 0.83 reports them wrong. */
  hide(): void;
  /** The view's own frame changed: a window that shrinks late, a sheet that grows. */
  layout(): void;
};

export function createKeyboardAvoider(
  measure: (done: (frame: WindowFrame) => void) => void,
  setPadding: (padding: number) => void
): KeyboardAvoider {
  let keyboardTop: number | null = null;
  let padding = 0;
  // Measuring is asynchronous. Only the answer to the latest question counts.
  let question = 0;

  const apply = (next: number) => {
    if (next === padding) return;
    padding = next;
    setPadding(next);
  };

  const remeasure = () => {
    if (keyboardTop === null) return;
    const top = keyboardTop;
    const asked = ++question;
    measure((frame) => {
      if (asked !== question) return;
      apply(keyboardOverlap(frame, top));
    });
  };

  return {
    show(top) {
      keyboardTop = top;
      remeasure();
    },
    hide() {
      keyboardTop = null;
      question++;
      apply(0);
    },
    layout() {
      remeasure();
    }
  };
}

/** The part of React Native's Keyboard that followKeyboard uses. */
export type KeyboardSource = {
  addListener(
    event: "keyboardDidShow" | "keyboardDidHide",
    listener: (event: { endCoordinates: { screenY: number } }) => void
  ): { remove(): void };
  isVisible(): boolean;
  metrics(): { screenY: number } | null | undefined;
};

/**
 * Feeds the keyboard's events to an avoider until the returned function is
 * called (a useEffect cleanup).
 *
 * In React Native 0.83 on Android (ReactRootView.checkForKeyboardEvents),
 * keyboardDidShow's screenY is where the keyboard starts on screen, while its
 * height leaves out the navigation bar, so only screenY tells how much of a
 * view is covered. keyboardDidHide's screenY is the visible area's height,
 * not a keyboard edge, so nothing in the hide event is read.
 */
export function followKeyboard(keyboard: KeyboardSource, avoider: KeyboardAvoider): () => void {
  const shown = keyboard.addListener("keyboardDidShow", (event) => avoider.show(event.endCoordinates.screenY));
  const hidden = keyboard.addListener("keyboardDidHide", () => avoider.hide());
  // Mounted with the keyboard already open: React Native keeps the last
  // keyboardDidShow's coordinates until the keyboard closes.
  const open = keyboard.isVisible() ? keyboard.metrics() : undefined;
  if (open) avoider.show(open.screenY);
  return () => {
    shown.remove();
    hidden.remove();
  };
}
