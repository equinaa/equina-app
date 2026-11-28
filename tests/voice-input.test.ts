import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  chooseSpeechLocale,
  cleanLocaleTag,
  DICTATION_HINT,
  joinSpoken,
  noLanguageHint,
  PERMISSION_HINT,
  pickSpeechLocale,
  resolveSpeechLocale,
  READY_HINT,
  RETRY_HINT,
  NOTHING_HEARD_HINT,
  TAP_HINT,
  WAIT_HINT,
  voiceErrorHint,
  wantedSpeechLocales
} from "../src/features/coach/voice-text";

// Asking Ralf by voice (2026-11-27): hold the mic, speak, let go. Speech
// becomes text on the phone and lands in the box, to read before sending.

{
  assert.equal(joinSpoken("", "how do I"), "how do I");
  assert.equal(joinSpoken("Don is stiff", "on the left rein"), "Don is stiff on the left rein", "What is heard goes after what was typed.");
  assert.equal(joinSpoken("Don is stiff ", "  on the left rein "), "Don is stiff on the left rein", "One space between, none at the ends.");
  assert.equal(joinSpoken("Typed", "   "), "Typed", "Nothing heard changes nothing.");
}

// TestFlight build 10 (2026-11-28): an iPhone in Portuguese (Brazil), region
// Romania, sent Intl's locale ("pt-RO" or the like). Apple's recognizer lists
// no such tag, the session failed with "language-not-supported" and the mic
// hid in silence.
{
  // Part of Apple's list (SFSpeechRecognizer.supportedLocales), as it spells it.
  const apple = ["de-DE", "en-AU", "en-GB", "en-US", "es-ES", "es-MX", "fr-FR", "hu-HU", "it-IT", "pt-BR", "pt-PT", "ro-RO"];
  assert.equal(pickSpeechLocale(["pt-RO"], apple), "pt-BR", "Portuguese with a region Apple does not list is heard as Brazilian Portuguese.");
  assert.equal(pickSpeechLocale(["en-RO"], apple), "en-US");
  assert.equal(pickSpeechLocale(["en"], apple), "en-US", "A bare language gets its usual region.");
  assert.equal(pickSpeechLocale(["en-GB@rg=rozzzz"], apple), "en-GB", "The region override after @ is dropped.");
  assert.equal(pickSpeechLocale(["en-GB-u-rg-rozzzz"], apple), "en-GB", "So is a -u- extension.");
  assert.equal(pickSpeechLocale(["ro"], apple), "ro-RO");
  assert.equal(pickSpeechLocale(["pt_PT"], apple), "pt-PT", "Underscores read as dashes; Portugal stays Portugal.");
  assert.equal(pickSpeechLocale(["pt-BR"], apple), "pt-BR");
  assert.equal(pickSpeechLocale(["PT-br"], apple), "pt-BR", "Case does not matter, and the tag comes back as listed.");
  assert.equal(pickSpeechLocale(["hu"], apple), "hu-HU");
  assert.equal(pickSpeechLocale(["fr-BE"], apple), "fr-FR");
  assert.equal(pickSpeechLocale(["xx"], apple), null, "A language the phone cannot hear: none.");
  assert.equal(pickSpeechLocale([], apple), null);
  assert.equal(pickSpeechLocale(["xx-RO", "ro-RO"], apple), "ro-RO", "An unknown first language falls through to the next one.");
  assert.equal(pickSpeechLocale(["pt-RO", "en-US"], apple), "pt-BR", "The first language the phone knows wins: it is the one the rider speaks.");
  assert.equal(pickSpeechLocale(["es-AR"], ["es-MX", "es-US"]), "es-MX", "Without the usual region, any region of the language.");
  assert.equal(pickSpeechLocale(["pt-BR"], ["en-US", "pt_BR"]), "pt_BR", "The tag goes back exactly as the recognizer listed it.");
  assert.equal(pickSpeechLocale(["zh-Hant-TW"], ["zh-CN", "zh-TW"]), "zh-TW", "A script between language and region keeps the region.");

  assert.equal(cleanLocaleTag(" en_GB@rg=rozzzz "), "en-GB");
  assert.equal(cleanLocaleTag("zh-Hans-CN"), "zh-Hans-CN", "Scripts and regions stay.");

  // The iPhone's own languages first (AppleLanguages), then Intl's locale; no repeats, no junk.
  assert.deepEqual(wantedSpeechLocales(["pt-BR", "en-RO"], "en-RO"), ["pt-BR", "en-RO"]);
  assert.deepEqual(wantedSpeechLocales(undefined, "pt-RO"), ["pt-RO"], "Android and the web have no list.");
  assert.deepEqual(wantedSpeechLocales("ro-RO", "en"), ["ro-RO", "en"]);
  assert.deepEqual(wantedSpeechLocales([42, "", "hu-HU"], "en"), ["hu-HU", "en"]);

  // Installed for offline use first; with no list from the phone, the first language, cleaned.
  assert.equal(chooseSpeechLocale(["pt-RO"], { locales: apple, installedLocales: apple }), "pt-BR");
  assert.equal(chooseSpeechLocale(["pt-PT"], { locales: ["pt-BR", "pt-PT"], installedLocales: ["pt-BR"] }), "pt-BR", "The installed one, which works offline.");
  assert.equal(chooseSpeechLocale(["ro-RO"], { locales: ["en-US", "ro-RO"], installedLocales: ["en-US"] }), "ro-RO", "Supported but not installed: still the rider's language.");
  assert.equal(chooseSpeechLocale(["xx-YY"], { locales: apple, installedLocales: apple }), null);
  assert.equal(chooseSpeechLocale(["en-GB@rg=rozzzz"], { locales: [], installedLocales: [] }), "en-GB");
  assert.equal(chooseSpeechLocale(["pt-BR"], null), "pt-BR");

  // Asking the recognizer: its list when it answers, the first language as it is when it fails or never answers.
  assert.equal(await resolveSpeechLocale(["pt-RO"], async () => ({ locales: apple, installedLocales: apple })), "pt-BR");
  assert.equal(await resolveSpeechLocale(["xx"], async () => ({ locales: apple, installedLocales: apple })), null);
  assert.equal(await resolveSpeechLocale(["en-GB@rg=rozzzz"], () => Promise.reject(new Error("error_5"))), "en-GB");
  assert.equal(await resolveSpeechLocale(["ro-RO"], () => { throw new Error("no such function"); }), "ro-RO");
  const began = Date.now();
  assert.equal(await resolveSpeechLocale(["hu"], () => new Promise(() => {}), 50), "hu", "A list that never comes does not hold the press.");
  assert.ok(Date.now() - began < 1000);
}

// The mic never fails in silence: every failure says what to do.
{
  assert.equal(voiceErrorHint("language-not-supported", "ios"), "Voice isn't available in this iPhone's language.");
  assert.equal(voiceErrorHint("language-not-supported", "android"), "Voice isn't available in this phone's language.");
  assert.equal(noLanguageHint("ios"), "Voice isn't available in this iPhone's language.");
  assert.equal(voiceErrorHint("service-not-allowed", "ios"), DICTATION_HINT, "Dictation off, or this language not downloaded.");
  assert.equal(DICTATION_HINT, "Turn on Dictation in Settings › General › Keyboard to ask by voice.");
  assert.equal(voiceErrorHint("service-not-allowed", "android"), PERMISSION_HINT);
  assert.equal(voiceErrorHint("not-allowed", "ios"), PERMISSION_HINT);
  assert.equal(voiceErrorHint("audio-capture", "ios"), RETRY_HINT);
  assert.equal(voiceErrorHint("network", "android"), RETRY_HINT);
  assert.equal(voiceErrorHint("aborted", "ios"), null, "Stopped on purpose: nothing to say.");
  assert.equal(voiceErrorHint("no-speech", "ios"), null, "Nothing heard is said when the session ends.");
  assert.equal(voiceErrorHint("speech-timeout", "android"), null);
}

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

{
  const hook = read("src/features/coach/useVoiceInput.ts");
  // On the phone only: no audio leaves it, and a phone that cannot do that gets no mic.
  assert.match(hook, /requiresOnDeviceRecognition: true/);
  assert.match(hook, /module\.isRecognitionAvailable\(\) && module\.supportsOnDeviceRecognition\(\)/);
  assert.match(hook, /if \(Platform\.OS === "web" \|\| /, "Not on the web, where the browser would send the audio away.");
  // A build without the native module (made before it was added) runs on, without a mic.
  // Expo is asked first: Metro reports a failing run-time require as fatal, past any try/catch.
  assert.match(hook, /if \(!requireOptionalNativeModule\("ExpoSpeechRecognition"\)\) return \(loaded = null\);\s+try \{/);
  assert.equal(
    readFileSync(join(process.cwd(), "node_modules/expo-speech-recognition/build/ExpoSpeechRecognitionModule.js"), "utf8").includes('requireNativeModule("ExpoSpeechRecognition")'),
    true,
    "The package's native module is still called ExpoSpeechRecognition.",
  );
  assert.match(hook, /try \{\s+loaded = \(require\("expo-speech-recognition"\) as SpeechPackage\)\.ExpoSpeechRecognitionModule;\s+\} catch \{\s+loaded = null;/);
  // Let go before the permission answer: it does not start after all; let go
  // before the native session began: stopped as soon as it does.
  assert.match(hook, /const settle = \(next\?: string\) => \{\s+busy\.current = false;\s+setListening\(false\);\s+setRideMicListening\(false\);\s+if \(next\) say\(next\);/);
  assert.match(hook, /if \(released\.current\) return settle\(READY_HINT\);/);
  assert.match(hook, /module\.addListener\("start", \(\) => \{\s+if \(released\.current\) module\.stop\(\);/);
  // One session at a time: a press while the last one finishes is ignored, so its late words never land twice.
  assert.match(hook, /if \(!module \|\| !enabled\) return;\s+\/\/[^\n]*\n\s+\/\/[^\n]*\n\s+if \(busy\.current\) \{\s+say\(WAIT_HINT\);\s+return;\s+\}\s+busy\.current = true;/);
  // A language the recognizer lists, picked once from the iPhone's own languages
  // then Intl's locale, never Intl's locale as it is. Android only from 13 (on-device guaranteed).
  assert.match(hook, /return Settings\.get\("AppleLanguages"\);/);
  assert.match(
    hook,
    /language \?\?= resolveSpeechLocale\(wantedSpeechLocales\(phoneLanguages\(\), deviceSpeechLocale\(\)\), \(\) =>\s+module\.getSupportedLocales\(\{\}\)\s+\);/,
    "Asked once, then kept.",
  );
  assert.match(
    hook,
    /const lang = await speechLanguage\(module\);\s+\/\/[^\n]*\n\s+if \(released\.current\) return settle\(shown\.current \? undefined : RETRY_HINT\);\s+if \(!lang\) \{\s+settle\(noLanguageHint\(Platform\.OS\)\);\s+setSupported\(false\);\s+return;\s+\}\s+\/\/[^\n]*\n\s+setRideMicListening\(true\);\s+module\.start\(\{\s+lang,/,
    "No language the phone can hear: say so, and do not start.",
  );
  assert.doesNotMatch(hook, /lang: deviceSpeechLocale\(\)/);
  assert.match(hook, /Platform\.OS === "android" && Number\(Platform\.Version\) < 33/);
  // No silent hiding: the hint comes first and stays to say why the mic went.
  assert.match(
    hook,
    /const next = voiceErrorHint\(event\.error, Platform\.OS\);\s+if \(!next\) return;\s+say\(next\);\s+if \(event\.error === "language-not-supported"\) \{[\s\S]{0,200}setSupported\(false\);/,
  );
  assert.equal((hook.match(/setSupported\(false\)/g) ?? []).length, 2, "Only a language the phone cannot hear hides the mic; Dictation off keeps it, to try again once it is on.");
  assert.match(read("src/ui/conversation/ConversationComposer.tsx"), /\{voice\?\.hint && !listening \? \(/, "The hint shows with or without the mic.");
  // First use: the permission prompts lift the finger; once allowed, say it is ready.
  assert.match(hook, /if \(!permission\.granted\) return settle\(PERMISSION_HINT\);\s+\/\/[^\n]*\n\s+if \(released\.current\) return settle\(READY_HINT\);/);
  // Nothing heard ("nomatch", "no-speech") and no words at all: said when the session ends.
  assert.match(hook, /module\.addListener\("nomatch", \(\) => \{\s+missed\.current = true;/);
  assert.match(hook, /if \(event\.error === "no-speech" \|\| event\.error === "speech-timeout"\) \{[\s\S]{0,120}missed\.current = true;\s+return;/);
  assert.match(hook, /if \(transcript\.trim\(\)\) spoke\.current = true;/, "Interim words count as heard.");
  assert.match(
    hook,
    /module\.addListener\("end", \(\) => \{\s+finish\(\);[\s\S]{0,160}if \(missed\.current && !spoke\.current && !shown\.current\) say\(NOTHING_HEARD_HINT\);/,
    "A hint already given (a tap, an error) is not replaced.",
  );
  assert.match(hook, /spoke\.current = false;\s+missed\.current = false;\s+say\(""\);/, "Each press starts clean.");
  // Other apps' music is ducked, then handed back.
  assert.match(hook, /categoryOptions: \["defaultToSpeaker", "allowBluetooth", "duckOthers"\]/);
  assert.match(hook, /setAudioSessionActiveIOS\(false, \{ notifyOthersOnDeactivation: true \}\)/);
  assert.match(hook, /if \(Date\.now\(\) - startedAt\.current < 350 && !heard\.current\) say\(TAP_HINT\);/, "A tap says how it works.");
}

{
  // The library calls the events and the language list as the hook expects (3.1.3).
  const types = read("node_modules/expo-speech-recognition/build/ExpoSpeechRecognitionModule.types.d.ts");
  assert.match(types, /nomatch: null;/);
  assert.match(types, /getSupportedLocales\(options: \{[\s\S]{0,600}locales: string\[\];[\s\S]{0,300}installedLocales: string\[\];/);
  // The rider's languages come from iOS settings, which this React Native still ships.
  assert.match(read("node_modules/react-native/Libraries/Settings/Settings.d.ts"), /get\(key: string\): any;/);
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

{
  // The hints are the whole point of this fix: none may go blank.
  assert.equal(TAP_HINT, "Hold the mic while you speak.");
  assert.equal(READY_HINT, "Ready. Hold the mic while you speak.");
  assert.equal(NOTHING_HEARD_HINT, "Couldn't hear that. Hold the mic while you speak.");
  for (const hint of [PERMISSION_HINT, RETRY_HINT, TAP_HINT, READY_HINT, NOTHING_HEARD_HINT, WAIT_HINT, DICTATION_HINT, noLanguageHint("ios"), noLanguageHint("android")]) {
    assert.ok(hint.trim(), "Every hint says something.");
  }
  const hook = read("src/features/coach/useVoiceInput.ts");
  // The language list is asked for as the screen opens, not on the first press.
  assert.match(hook, /if \(!module\) return;\s+\/\/[^\n]*\n\s+\/\/[^\n]*\n\s+void speechLanguage\(module\);/);
  // A press while the last session finishes gets a word instead of nothing.
  assert.match(hook, /if \(busy\.current\) \{\s+say\(WAIT_HINT\);\s+return;\s+\}/);
}
