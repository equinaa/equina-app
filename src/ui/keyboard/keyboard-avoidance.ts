// Keyboard avoidance for iOS and Android, kept free of React Native so it can
// be tested in Node.
//
// Both platforms measure where the view ends on screen and pad it by the part
// the keyboard covers. React Native's KeyboardAvoidingView cannot be trusted
// for that: it takes the view's frame from onLayout, which is relative to its
// parent, and compares it with the keyboard's top edge, which is relative to
// the screen. That only works when the parent starts at the top of the screen.
//
// iOS: Ralf, the shop conversation and the sign-in and onboarding screens sit
// inside the safe area (and Ralf inside the tab content's ScrollView), so
// their parent starts at the status bar, 62 pt down on an iPhone 17 Pro. The
// view was lifted 62 pt too little and the keyboard covered Ralf's composer.
// Sheets in a Modal start at the top and were right; measuring keeps them so.
//
// Android: the app targets Android 16 and runs edge to edge, so the window no
// longer shrinks when the keyboard opens (the platform's
// Window.setDecorFitsSystemWindows: with false "the framework will not fit the
// content view to the insets", and an app targeting Android 15 or later always
// behaves that way). React Native 0.83's KeyboardAvoidingView then has two
// Android faults:
// - keyboardDidHide carries a wrong screenY, so a view that reaches the bottom
//   of the screen keeps a gap as tall as the system bars after the keyboard
//   closes (fixed upstream only in 0.86, facebook/react-native#55855);
// - the same parent-relative frame as on iOS: a screen inside the safe area is
//   lifted too little, by the status bar's height.
//
// So: when the keyboard opens, measure where the view ends on screen and pad
// it by the part the keyboard covers; when it closes, no padding. If the
// window does shrink after all, the view then ends above the keyboard, the
// overlap is 0, and nothing is added twice.
//
// "On screen" is measure()'s pageY, not measureInWindow: in React Native 0.83
// measureInWindow adds the root's viewport offset on Android (RootViewUtil,
// the root's position minus the visible frame's top), which edge to edge is
// minus the status bar in the main window and nothing inside a Modal. pageY
// leaves it out, and on both platforms the root views start at the top of the
// screen, as the keyboard's screenY does.

/** A view's vertical extent from the top of its root view (measure's pageY). */
export type WindowFrame = { y: number; height: number };

/** How much of the view the keyboard covers, in the same units as the frame. */
export function keyboardOverlap(
  frame: WindowFrame | null | undefined,
  keyboardTop: number | null | undefined
): number {
  // A top edge at 0 is not a keyboard: iOS reports 0 when Prefer Cross-Fade
  // Transitions is on (React Native's KeyboardAvoidingView ignores it too).
  if (!frame || keyboardTop == null || !Number.isFinite(keyboardTop) || keyboardTop <= 0) return 0;
  const bottom = frame.y + frame.height;
  if (!Number.isFinite(bottom)) return 0;
  return Math.max(0, Math.round(bottom - keyboardTop));
}

export type KeyboardAvoider = {
  /** The keyboard opened or changed size: its top edge from the top of the screen (endCoordinates.screenY). */
  show(keyboardTop: number): void;
  /** The keyboard closes. Its coordinates are not read: React Native 0.83 reports them wrong on Android. */
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

/** What React Native's keyboard events carry that the avoider reads. */
export type KeyboardEventLike = {
  endCoordinates: { screenY: number };
  /** iOS: how long the keyboard takes to move, in ms. 0 on Android. */
  duration?: number;
  /** iOS: the keyboard's animation curve. "keyboard" on Android. */
  easing?: string;
};

export type KeyboardEventName = "keyboardWillShow" | "keyboardWillHide" | "keyboardDidShow" | "keyboardDidHide";

/** Which events open and close the keyboard for the avoider. */
export type KeyboardEvents = { show: KeyboardEventName; hide: KeyboardEventName };

/**
 * iOS announces the keyboard before it moves, with its final frame, so the
 * padding can move with it. iOS sends keyboardWillShow again when an open
 * keyboard changes height. These are the events React Native's
 * KeyboardAvoidingView uses on iOS (not keyboardWillChangeFrame, which an
 * undocked or floating keyboard sends before keyboardWillHide).
 */
export const iosKeyboardEvents: KeyboardEvents = { show: "keyboardWillShow", hide: "keyboardWillHide" };

/**
 * In React Native 0.83 on Android (ReactRootView.checkForKeyboardEvents),
 * keyboardDidShow's screenY is where the keyboard starts on screen, while its
 * height leaves out the navigation bar, so only screenY tells how much of a
 * view is covered. keyboardDidHide's screenY is the visible area's height,
 * not a keyboard edge, so nothing in the hide event is read.
 */
export const androidKeyboardEvents: KeyboardEvents = { show: "keyboardDidShow", hide: "keyboardDidHide" };

/** The part of React Native's Keyboard that followKeyboard uses. */
export type KeyboardSource = {
  addListener(event: KeyboardEventName, listener: (event: KeyboardEventLike) => void): { remove(): void };
  isVisible(): boolean;
  metrics(): { screenY: number } | null | undefined;
};

/**
 * Feeds the keyboard's events to an avoider until the returned function is
 * called (a useEffect cleanup). `beforeChange` sees each event first, so the
 * caller can animate the padding change it causes.
 */
export function followKeyboard(
  keyboard: KeyboardSource,
  avoider: KeyboardAvoider,
  events: KeyboardEvents = androidKeyboardEvents,
  beforeChange?: (event: KeyboardEventLike) => void
): () => void {
  const shown = keyboard.addListener(events.show, (event) => {
    beforeChange?.(event);
    avoider.show(event.endCoordinates.screenY);
  });
  const hidden = keyboard.addListener(events.hide, (event) => {
    beforeChange?.(event);
    avoider.hide();
  });
  // Mounted with the keyboard already open: React Native keeps the last
  // keyboardDidShow's coordinates until the keyboard closes.
  const open = keyboard.isVisible() ? keyboard.metrics() : undefined;
  if (open) avoider.show(open.screenY);
  return () => {
    shown.remove();
    hidden.remove();
  };
}

/**
 * How the padding change caused by a keyboard event should animate on iOS,
 * so the content moves with the keyboard as KeyboardAvoidingView's did. None
 * without a duration (Android, or a change not caused by the keyboard).
 */
export function keyboardLayoutAnimation(
  event: KeyboardEventLike | null | undefined
): { duration: number; update: { duration: number; type: string } } | null {
  if (!event?.duration || !event.easing) return null;
  // RCTLayoutAnimation's smallest accepted duration.
  const duration = Math.max(event.duration, 10);
  return { duration, update: { duration, type: event.easing } };
}
