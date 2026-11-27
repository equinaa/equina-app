import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { joinSpoken } from "../src/features/coach/voice-text";

// Asking Ralf by voice (2026-11-27): hold the mic, speak, let go. Speech
// becomes text on the phone and lands in the box, to read before sending.

{
  assert.equal(joinSpoken("", "how do I"), "how do I");
  assert.equal(joinSpoken("Don is stiff", "on the left rein"), "Don is stiff on the left rein", "What is heard goes after what was typed.");
  assert.equal(joinSpoken("Don is stiff ", "  on the left rein "), "Don is stiff on the left rein", "One space between, none at the ends.");
  assert.equal(joinSpoken("Typed", "   "), "Typed", "Nothing heard changes nothing.");
}

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

{
  const hook = read("src/features/coach/useVoiceInput.ts");
  // On the phone only: no audio leaves it, and a phone that cannot do that gets no mic.
  assert.match(hook, /requiresOnDeviceRecognition: true/);
  assert.match(hook, /module\.isRecognitionAvailable\(\) && module\.supportsOnDeviceRecognition\(\)/);
  assert.match(hook, /if \(Platform\.OS === "web"\) return \(loaded = null\);/, "Not on the web, where the browser would send the audio away.");
  // A build without the native module (made before it was added) runs on, without a mic.
  assert.match(hook, /try \{\s+loaded = \(require\("expo-speech-recognition"\) as SpeechPackage\)\.ExpoSpeechRecognitionModule;\s+\} catch \{\s+loaded = null;/);
  // Let go before the permission answer: it does not start after all.
  assert.match(hook, /if \(released\.current\) \{\s+setListening\(false\);\s+return;/);
  assert.match(hook, /setHint\("Hold the mic while you speak\."\)/, "A tap says how it works.");
}

{
  const composer = read("src/ui/conversation/ConversationComposer.tsx");
  assert.match(composer, /onPressIn=\{\(\) => \{\s+selectionHaptic\(\);\s+voice\.start\(\);\s+\}\}\s+onPressOut=\{\(\) => voice\.stop\(\)\}/, "Hold to talk, let go to stop.");
  assert.match(composer, /\{voice\?\.available \? \(/, "No mic where voice is not available.");
  assert.doesNotMatch(composer, /voice\.stop\(\);?\s*onSend\(\)/, "Letting go never sends: the rider reads the words first.");
  const screen = read("src/features/coach/CoachScreen.tsx");
  assert.match(screen, /const voice = useVoiceInput\(\{\s+text: draft,\s+onText: setDraft,/);
  assert.match(screen, /voice=\{voice\}/);
}

console.log("Voice input passed.");
