import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  androidKeyboardEvents,
  createKeyboardAvoider,
  followKeyboard,
  iosKeyboardEvents,
  keyboardLayoutAnimation,
  keyboardOverlap,
  type KeyboardEventLike,
  type KeyboardEventName,
  type KeyboardSource,
  type WindowFrame
} from "../src/ui/keyboard/keyboard-avoidance";

// Keyboard avoidance, without a device. Android first: numbers are dp on a
// 915 dp tall phone: status bar 48, navigation bar 24, keyboard top edge at 565
// (350 dp of keyboard including the navigation bar).
const screen = 915;
const keyboardTop = 565;

{
  // A sheet in an edge-to-edge Modal reaches the bottom of the screen.
  assert.equal(keyboardOverlap({ y: 0, height: screen }, keyboardTop), 350);
  // A screen inside the safe area ends above the navigation bar. measure()'s
  // pageY counts from the root view, which edge to edge is the top of the
  // screen, so the parent's offset no longer matters. (KeyboardAvoidingView's
  // parent-relative frame, and measureInWindow, which subtracts the status bar
  // in the main window, would both say y = 0 here and lift it 48 dp too little.)
  assert.equal(keyboardOverlap({ y: 48, height: screen - 48 - 24 }, keyboardTop), 326);
  // A window that did shrink for the keyboard: nothing to add.
  assert.equal(keyboardOverlap({ y: 0, height: keyboardTop }, keyboardTop), 0);
  assert.equal(keyboardOverlap({ y: 48, height: 400 }, keyboardTop), 0);
  // No keyboard, no frame, nonsense input.
  assert.equal(keyboardOverlap({ y: 0, height: screen }, null), 0);
  assert.equal(keyboardOverlap(null, keyboardTop), 0);
  assert.equal(keyboardOverlap({ y: 0, height: Number.NaN }, keyboardTop), 0);
  // iOS with Prefer Cross-Fade Transitions reports the keyboard at 0: not an edge.
  assert.equal(keyboardOverlap({ y: 0, height: screen }, 0), 0);
}

{
  // iOS, measured on an iPhone 17 Pro (iOS 26.4, points): Ralf sits inside
  // the tab content's ScrollView, under the 62 pt status bar, 778 pt tall,
  // so it ends 34 pt above the bottom; the keyboard's top edge is at 566.
  const iosKeyboardTop = 566;
  const ralf = { y: 62, height: 778 };
  assert.equal(keyboardOverlap(ralf, iosKeyboardTop), 274, "Lifted by all it covers: 62 + 778 - 566.");
  // What React Native's KeyboardAvoidingView did: its frame comes from
  // onLayout, relative to the ScrollView (y = 0), so it padded 212 and the
  // 70 pt composer stayed behind the keyboard but for a sliver.
  assert.equal(keyboardOverlap({ y: 0, height: ralf.height }, iosKeyboardTop), 212);
  // A sheet in a Modal starts at the top of the screen: the same as before.
  assert.equal(keyboardOverlap({ y: 0, height: 874 }, iosKeyboardTop), 308);
}

// A fake measure whose answers arrive when the test says so.
function harness(initial: WindowFrame) {
  let frame = initial;
  const pending: Array<(frame: WindowFrame) => void> = [];
  const paddings: number[] = [];
  const avoider = createKeyboardAvoider((done) => pending.push(done), (value) => paddings.push(value));
  return {
    avoider,
    paddings,
    setFrame(next: WindowFrame) {
      frame = next;
    },
    answer() {
      while (pending.length) pending.shift()?.(frame);
    },
    get padding() {
      return paddings.at(-1) ?? 0;
    }
  };
}

{
  // The window does not shrink (edge to edge): pad by the overlap, then drop
  // it on hide whatever coordinates the hide event carries.
  const sheet = harness({ y: 0, height: screen });
  sheet.avoider.show(keyboardTop);
  sheet.answer();
  assert.equal(sheet.padding, 350);
  sheet.avoider.hide();
  assert.equal(sheet.padding, 0);
}

{
  // The window shrinks before the event: no padding, so never twice.
  const screenView = harness({ y: 48, height: keyboardTop - 48 });
  screenView.avoider.show(keyboardTop);
  screenView.answer();
  assert.deepEqual(screenView.paddings, []);
}

{
  // The window shrinks after the event: the layout change takes the padding
  // back, so the content is not lifted twice.
  const late = harness({ y: 48, height: screen - 48 - 24 });
  late.avoider.show(keyboardTop);
  late.answer();
  assert.equal(late.padding, 326);
  late.setFrame({ y: 48, height: keyboardTop - 48 });
  late.avoider.layout();
  late.answer();
  assert.equal(late.padding, 0);
}

{
  // Padding does not move the view's own frame, so measuring again changes nothing.
  const steady = harness({ y: 0, height: screen });
  steady.avoider.show(keyboardTop);
  steady.answer();
  steady.avoider.layout();
  steady.answer();
  assert.deepEqual(steady.paddings, [350]);
}

{
  // The keyboard closes before the measurement comes back: the late answer is
  // dropped instead of lifting a screen with no keyboard under it.
  const stale = harness({ y: 0, height: screen });
  stale.avoider.show(keyboardTop);
  stale.avoider.hide();
  stale.answer();
  assert.equal(stale.padding, 0);
  // Layout changes with the keyboard closed measure nothing.
  stale.avoider.layout();
  stale.answer();
  assert.equal(stale.padding, 0);
}

{
  // Only the latest question counts: a second show with a taller keyboard wins.
  const twice = harness({ y: 0, height: screen });
  twice.avoider.show(keyboardTop);
  twice.avoider.show(keyboardTop - 50);
  twice.answer();
  assert.equal(twice.padding, 400);
}

// A stand-in for React Native's Keyboard that fires Android's events the way
// React Native 0.83 builds them (ReactRootView.checkForKeyboardEvents):
// keyboardDidShow carries the keyboard's top edge as screenY and, as height,
// the keyboard without the navigation bar; keyboardDidHide carries the
// visible area's height as screenY. Keyboard.metrics() keeps the last
// keyboardDidShow's coordinates until the keyboard closes.
type KeyboardCoordinates = { screenX: number; screenY: number; width: number; height: number };
type FakeEvent = KeyboardEventLike & { endCoordinates: KeyboardCoordinates };
function fakeKeyboard() {
  const listeners = new Map<KeyboardEventName, Set<(event: FakeEvent) => void>>();
  let showing: KeyboardCoordinates | undefined;
  const source: KeyboardSource = {
    addListener(event, listener) {
      const set = listeners.get(event) ?? new Set();
      listeners.set(event, set);
      set.add(listener);
      return { remove: () => void set.delete(listener) };
    },
    isVisible: () => showing !== undefined,
    metrics: () => showing
  };
  const fire = (name: KeyboardEventName, event: FakeEvent) => {
    for (const listener of [...(listeners.get(name) ?? [])]) listener(event);
  };
  return {
    source,
    fire,
    show(endCoordinates: KeyboardCoordinates) {
      showing = endCoordinates;
      fire("keyboardDidShow", { endCoordinates });
    },
    hide(endCoordinates: KeyboardCoordinates) {
      showing = undefined;
      fire("keyboardDidHide", { endCoordinates });
    },
    listeningTo(name: KeyboardEventName) {
      return listeners.get(name)?.size ?? 0;
    },
    get listening() {
      return [...listeners.values()].reduce((sum, set) => sum + set.size, 0);
    }
  };
}
const shownEvent: KeyboardCoordinates = { screenX: 0, screenY: keyboardTop, width: 412, height: screen - keyboardTop - 24 };
const hiddenEvent: KeyboardCoordinates = { screenX: 0, screenY: screen - 48 - 24, width: 412, height: 0 };

{
  // What the container subscribes to: the keyboard's top edge on show,
  // nothing from the hide event, and nothing once it unmounts.
  const keyboard = fakeKeyboard();
  const sheet = harness({ y: 0, height: screen });
  const stop = followKeyboard(keyboard.source, sheet.avoider);
  assert.equal(keyboard.listening, 2);
  assert.equal(keyboard.listeningTo("keyboardDidShow"), 1, "Android follows keyboardDidShow by default.");
  assert.equal(keyboard.listeningTo("keyboardDidHide"), 1);
  keyboard.show(shownEvent);
  sheet.answer();
  assert.equal(sheet.padding, 350, "Padded by the part under the keyboard's top edge (screenY), not by the keyboard's height.");
  keyboard.hide(hiddenEvent);
  sheet.answer();
  assert.equal(sheet.padding, 0, "No padding once the keyboard closes, whatever keyboardDidHide's coordinates say.");
  stop();
  assert.equal(keyboard.listening, 0, "Unmounting removes both listeners.");
  keyboard.show(shownEvent);
  sheet.answer();
  assert.equal(sheet.padding, 0, "A view that is gone does not follow the keyboard.");
}

{
  // Mounted while the keyboard is already open, as a sheet opened from a
  // focused field is.
  const keyboard = fakeKeyboard();
  keyboard.show(shownEvent);
  const sheet = harness({ y: 0, height: screen });
  const stop = followKeyboard(keyboard.source, sheet.avoider);
  sheet.answer();
  assert.equal(sheet.padding, 350);
  keyboard.hide(hiddenEvent);
  assert.equal(sheet.padding, 0);
  stop();
}

{
  // Mounted with the keyboard closed: nothing is measured or padded.
  const keyboard = fakeKeyboard();
  const screenView = harness({ y: 48, height: screen - 48 - 24 });
  followKeyboard(keyboard.source, screenView.avoider)();
  screenView.answer();
  assert.deepEqual(screenView.paddings, []);
}

{
  // iOS: the keyboard is announced before it moves (keyboardWillShow and
  // keyboardWillHide), so the padding moves with it; each event reaches the
  // caller first, with the timing the animation needs.
  const keyboard = fakeKeyboard();
  const ralf = harness({ y: 62, height: 778 });
  const seen: KeyboardEventLike[] = [];
  const stop = followKeyboard(keyboard.source, ralf.avoider, iosKeyboardEvents, (event) => seen.push(event));
  assert.equal(keyboard.listeningTo("keyboardWillShow"), 1);
  assert.equal(keyboard.listeningTo("keyboardWillHide"), 1);
  assert.equal(keyboard.listeningTo("keyboardDidShow"), 0, "iOS does not wait for the keyboard to finish moving.");
  const opening: FakeEvent = { endCoordinates: { screenX: 0, screenY: 566, width: 402, height: 308 }, duration: 250, easing: "keyboard" };
  keyboard.fire("keyboardWillShow", opening);
  ralf.answer();
  assert.equal(ralf.padding, 274);
  assert.deepEqual(seen, [opening]);
  // The keyboard grows (predictions bar): iOS sends keyboardWillShow again.
  keyboard.fire("keyboardWillShow", { ...opening, endCoordinates: { ...opening.endCoordinates, screenY: 522 } });
  ralf.answer();
  assert.equal(ralf.padding, 318);
  keyboard.fire("keyboardWillHide", { ...opening, endCoordinates: { ...opening.endCoordinates, screenY: 874 } });
  assert.equal(ralf.padding, 0);
  assert.equal(seen.length, 3);
  stop();
  assert.equal(keyboard.listening, 0);
}

{
  // The padding change animates with the keyboard on iOS; Android's events
  // carry no duration, so nothing animates there.
  assert.deepEqual(keyboardLayoutAnimation({ endCoordinates: { screenY: 566 }, duration: 250, easing: "keyboard" }), {
    duration: 250,
    update: { duration: 250, type: "keyboard" }
  });
  // RCTLayoutAnimation's smallest accepted duration.
  assert.equal(keyboardLayoutAnimation({ endCoordinates: { screenY: 566 }, duration: 5, easing: "keyboard" })?.duration, 10);
  assert.equal(keyboardLayoutAnimation({ endCoordinates: { screenY: 565 }, duration: 0, easing: "keyboard" }), null);
  assert.equal(keyboardLayoutAnimation(null), null);
  assert.deepEqual(androidKeyboardEvents, { show: "keyboardDidShow", hide: "keyboardDidHide" });
  assert.deepEqual(iosKeyboardEvents, { show: "keyboardWillShow", hide: "keyboardWillHide" });
}

// Structure: every keyboard-avoiding root goes through the container.
const root = process.cwd();
const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });

const container = join(root, "src", "ui", "keyboard", "KeyboardAvoidingContainer.tsx");
const appPath = join(root, "src", "App.tsx");
for (const path of sourceFiles(join(root, "src"))) {
  if (path === container) continue;
  let source = readFileSync(path, "utf8");
  if (path === appPath) {
    // App.tsx's ShopConversationPage still holds a KeyboardAvoidingView, but
    // nothing renders it. Rendering it again means moving it to the container.
    assert.doesNotMatch(source, /<ShopConversationPage\b/, "ShopConversationPage is rendered again: give it KeyboardAvoidingContainer.");
    const page = source.indexOf("function ShopConversationPage(");
    assert.ok(page >= 0, "ShopConversationPage moved; recheck this exception.");
    const next = source.indexOf("\nfunction ", page + 1);
    source = source.slice(0, page) + (next >= 0 ? source.slice(next) : "");
  }
  assert.doesNotMatch(
    source,
    /<KeyboardAvoidingView\b/,
    `${relative(root, path)} uses KeyboardAvoidingView directly; Android needs KeyboardAvoidingContainer.`
  );
}

const sites = [
  "src/ui/primitives/EquinaPrimitives.tsx",
  "src/features/coach/CoachScreen.tsx",
  "src/features/onboarding/OnboardingScreen.tsx",
  "src/features/account/AuthVerificationScreen.tsx",
  "src/features/account/PasswordRecoveryScreen.tsx",
  "src/features/messaging/ShopConversationScreen.tsx"
];
for (const site of sites) {
  assert.match(readFileSync(join(root, site), "utf8"), /<KeyboardAvoidingContainer\b/, `${site} lost its keyboard container.`);
}

const containerSource = readFileSync(container, "utf8");
// iOS and Android take the measured path, each with its own events; only iOS
// animates. The web keeps KeyboardAvoidingView with no behavior, as before.
assert.match(
  containerSource,
  /if \(Platform\.OS === "ios" \|\| Platform\.OS === "android"\) \{\s*return \(\s*<MeasuredKeyboardAvoidingView/
);
assert.match(containerSource, /events=\{Platform\.OS === "ios" \? iosKeyboardEvents : androidKeyboardEvents\}/);
assert.match(containerSource, /animate=\{Platform\.OS === "ios"\}/);
assert.match(containerSource, /<KeyboardAvoidingView style=\{style\} testID=\{testID\}>/);
assert.doesNotMatch(containerSource, /behavior=/, "No KeyboardAvoidingView behavior is left: its parent-relative frame is what broke iOS.");
// The frame must come from measure's pageY: measureInWindow is off by the status bar in the main window.
assert.match(containerSource, /\.measure\(\(_x, _y, _width, height, _pageX, pageY\) => done\(\{ y: pageY, height \}\)\)/);
assert.doesNotMatch(containerSource, /\.measureInWindow\(/);
// The React side, which only a device runs: the view measured is the one
// padded, the keyboard is followed through followKeyboard (tested above) and
// let go on unmount, and the padding goes inside the view.
assert.match(containerSource, /<View\s+ref=\{viewRef\}/, "The view measured must be the view padded.");
assert.match(containerSource, /setPadding\(next\);/, "The avoider's padding must reach the view's state.");
assert.match(
  containerSource,
  /followKeyboard\(Keyboard, avoider, events, \(event\) => \{/,
  "Subscribed through followKeyboard, whose return is the cleanup."
);
assert.match(containerSource, /\[avoider, events\]/);
assert.doesNotMatch(containerSource, /Keyboard\.addListener\(/, "The container listens only through followKeyboard.");
assert.match(containerSource, /onLayout=\{\(\) => avoider\.layout\(\)\}/, "A view whose frame changes is measured again.");
assert.match(
  containerSource,
  /style=\{padding > 0 \? \[style, \{ paddingBottom: padding \}\] : style\}/,
  "Padding inside the view lifts its content; a margin would move the view itself and change the next measurement."
);
// No screen hands the container an offset any more: the measurement already knows where the view is.
for (const site of sites) {
  assert.doesNotMatch(readFileSync(join(root, site), "utf8"), /keyboardVerticalOffset/, `${site} still passes keyboardVerticalOffset.`);
}

console.log("Keyboard avoidance (iOS and Android) passed.");
