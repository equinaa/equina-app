import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  createKeyboardAvoider,
  followKeyboard,
  keyboardOverlap,
  type KeyboardSource,
  type WindowFrame
} from "../src/ui/keyboard/keyboard-avoidance";

// Android keyboard avoidance, without a device. Numbers are dp on a 915 dp
// tall phone: status bar 48, navigation bar 24, keyboard top edge at 565
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
function fakeKeyboard() {
  const listeners = {
    keyboardDidShow: new Set<(event: { endCoordinates: KeyboardCoordinates }) => void>(),
    keyboardDidHide: new Set<(event: { endCoordinates: KeyboardCoordinates }) => void>()
  };
  let showing: KeyboardCoordinates | undefined;
  const source: KeyboardSource = {
    addListener(event, listener) {
      listeners[event].add(listener);
      return { remove: () => void listeners[event].delete(listener) };
    },
    isVisible: () => showing !== undefined,
    metrics: () => showing
  };
  return {
    source,
    show(endCoordinates: KeyboardCoordinates) {
      showing = endCoordinates;
      for (const listener of [...listeners.keyboardDidShow]) listener({ endCoordinates });
    },
    hide(endCoordinates: KeyboardCoordinates) {
      showing = undefined;
      for (const listener of [...listeners.keyboardDidHide]) listener({ endCoordinates });
    },
    get listening() {
      return listeners.keyboardDidShow.size + listeners.keyboardDidHide.size;
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

// Structure: every keyboard-avoiding root goes through the container, and its
// iOS and web path renders what the screens rendered before.
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
// Android only on the new path; iOS and the web get the same element with the same props as before.
assert.match(containerSource, /if \(Platform\.OS === "android"\) \{\s*return \(\s*<AndroidKeyboardAvoidingView/);
assert.match(containerSource, /<KeyboardAvoidingView behavior=\{Platform\.OS === "ios" \? "padding" : undefined\} \{\.\.\.rest\}>/);
// The frame must come from measure's pageY: measureInWindow is off by the status bar in the main window.
assert.match(containerSource, /\.measure\(\(_x, _y, _width, height, _pageX, pageY\) => done\(\{ y: pageY, height \}\)\)/);
assert.doesNotMatch(containerSource, /\.measureInWindow\(/);
// The React side of the Android path, which only a device runs: the view
// measured is the one padded, the keyboard is followed through followKeyboard
// (tested above) and let go on unmount, and the padding goes inside the view.
assert.match(containerSource, /<View\s+ref=\{viewRef\}/, "The view measured must be the view padded.");
assert.match(containerSource, /createKeyboardAvoider\([\s\S]*?\),\s*setPadding\s*\)/, "The avoider's padding must reach the view's state.");
assert.match(containerSource, /useEffect\(\(\) => followKeyboard\(Keyboard, avoider\), \[avoider\]\);/, "Subscribed through followKeyboard, whose return is the cleanup.");
assert.doesNotMatch(containerSource, /Keyboard\.addListener\(/, "The container listens only through followKeyboard.");
assert.match(containerSource, /onLayout=\{\(\) => avoider\.layout\(\)\}/, "A view whose frame changes is measured again.");
assert.match(
  containerSource,
  /style=\{padding > 0 \? \[style, \{ paddingBottom: padding \}\] : style\}/,
  "Padding inside the view lifts its content; a margin would move the view itself and change the next measurement."
);

console.log("Android keyboard avoidance passed.");
