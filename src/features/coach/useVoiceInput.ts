import { useCallback, useEffect, useRef, useState } from "react";
import { requireOptionalNativeModule } from "expo";
import { Platform, Settings } from "react-native";
import {
  joinSpoken,
  NOTHING_HEARD_HINT,
  noLanguageHint,
  PERMISSION_HINT,
  READY_HINT,
  resolveSpeechLocale,
  RETRY_HINT,
  TAP_HINT,
  voiceErrorHint,
  wantedSpeechLocales
} from "./voice-text";

type SpeechPackage = typeof import("expo-speech-recognition");
type SpeechModule = SpeechPackage["ExpoSpeechRecognitionModule"];

// The package loads its native module as it is imported, and a build made
// before it was added has none: read it once, and treat a missing one as no voice.
// Ask Expo first. Requiring the package without its native module is not an
// error a try/catch sees: Metro reports a module that fails to load at run
// time as fatal (a red screen in development, a closed app in a release).
let loaded: SpeechModule | null | undefined;
const speechModule = (): SpeechModule | null => {
  if (loaded !== undefined) return loaded;
  // Not on the web (the browser would send the audio away), and on Android
  // only from 13: before it the library falls back to the network service.
  if (Platform.OS === "web" || (Platform.OS === "android" && Number(Platform.Version) < 33)) return (loaded = null);
  if (!requireOptionalNativeModule("ExpoSpeechRecognition")) return (loaded = null);
  try {
    loaded = (require("expo-speech-recognition") as SpeechPackage).ExpoSpeechRecognitionModule;
  } catch {
    loaded = null;
  }
  return loaded;
};

/**
 * The app's locale as Intl reports it. It joins a language to the phone's
 * region ("pt-RO", "en-RO") or is just "pt": tags the recognizer does not
 * list, so a session asked for one fails with "language-not-supported". It
 * only backs up the phone's own languages (see speechLanguage).
 */
export const deviceSpeechLocale = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || "en-US";
  } catch {
    return "en-US";
  }
};

// The rider's real languages, best first. On iOS these are the iPhone's
// languages (Settings › General › Language & Region); elsewhere there is no list.
const phoneLanguages = (): unknown => {
  if (Platform.OS !== "ios") return [];
  try {
    return Settings.get("AppleLanguages");
  } catch {
    return [];
  }
};

// The language every session asks for, worked out once: the phone's
// languages do not change while the app runs (iOS restarts apps when they do).
let language: Promise<string | null> | undefined;
const speechLanguage = (module: SpeechModule) => {
  language ??= resolveSpeechLocale(wantedSpeechLocales(phoneLanguages(), deviceSpeechLocale()), () =>
    module.getSupportedLocales({})
  );
  return language;
};

/**
 * Whether this phone can turn speech into text without sending the audio
 * anywhere. This asks the phone's default recognizer (the iPhone language,
 * else the dictation language), not the language a session asks for: a
 * language with no recognizer says so when the mic is pressed.
 */
export const voiceInputAvailable = () => {
  const module = speechModule();
  if (!module) return false;
  try {
    return module.isRecognitionAvailable() && module.supportsOnDeviceRecognition();
  } catch {
    return false;
  }
};

export type VoiceInput = {
  /** The phone can do it: the mic shows. */
  available: boolean;
  listening: boolean;
  /** A word for the rider: how to use it, or what went wrong. Empty when there is none. */
  hint: string;
  /** Hold down: starts listening, text goes into the box as it is heard. */
  start: () => void;
  /** Let go: stops; what was heard stays in the box, to read before sending. */
  stop: () => void;
};

/**
 * Ask by voice: hold the mic, speak, let go. Speech is turned into text on
 * the phone (requiresOnDeviceRecognition): no audio leaves it, and nothing
 * is recorded. The words go into the box, where the rider reads them and
 * sends them like any typed question.
 *
 * One session at a time: a press while the last one is still finishing
 * waits for it, so its late words never land twice. Music playing in another
 * app is ducked while listening and handed back after.
 *
 * The mic never fails in silence: a press that does not end in words says
 * why (permission, Dictation off, a language the phone cannot hear, nothing
 * heard) or, on first use, that it is ready now.
 */
export function useVoiceInput({
  text,
  onText,
  enabled
}: {
  /** The box's text when listening starts: what is heard goes after it. */
  text: string;
  onText: (next: string) => void;
  enabled: boolean;
}): VoiceInput {
  const [supported, setSupported] = useState(voiceInputAvailable);
  const [listening, setListening] = useState(false);
  const [hint, setHint] = useState("");
  // The hint as last set, for the listeners: a word already given is not replaced.
  const shown = useRef("");
  const base = useRef("");
  const heard = useRef("");
  // Any words at all this session, interim ones included (heard holds final ones only).
  const spoke = useRef(false);
  // The recognizer reported nothing heard ("nomatch", "no-speech", "speech-timeout").
  const missed = useRef(false);
  const startedAt = useRef(0);
  // From press to the session's "end": no second session meanwhile.
  const busy = useRef(false);
  // Let go before the session started (permission prompt, native start): stop it once it does.
  const released = useRef(false);
  const latestText = useRef(text);
  latestText.current = text;
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  const say = useCallback((next: string) => {
    shown.current = next;
    setHint(next);
  }, []);

  useEffect(() => {
    const module = supported ? speechModule() : null;
    if (!module) return;
    const finish = () => {
      busy.current = false;
      setListening(false);
      if (Platform.OS === "ios") {
        try {
          // Hand the audio back: music another app was playing resumes.
          module.setAudioSessionActiveIOS(false, { notifyOthersOnDeactivation: true });
        } catch {
          // Already inactive.
        }
      }
    };
    const subscriptions = [
      module.addListener("start", () => {
        if (released.current) module.stop();
      }),
      module.addListener("result", (event) => {
        const transcript = event.results[0]?.transcript ?? "";
        if (transcript.trim()) spoke.current = true;
        // Android hands each pause's words over as final, then starts again;
        // iOS keeps one growing transcript. Both end up as base + all heard.
        const shownText = joinSpoken(heard.current, transcript);
        if (event.isFinal) heard.current = shownText;
        onTextRef.current(joinSpoken(base.current, shownText));
      }),
      module.addListener("nomatch", () => {
        missed.current = true;
      }),
      module.addListener("end", () => {
        finish();
        // Held, and no words came: say so, unless the rider already has a word (a tap, an error).
        if (missed.current && !spoke.current && !shown.current) say(NOTHING_HEARD_HINT);
      }),
      module.addListener("error", (event) => {
        finish();
        if (event.error === "no-speech" || event.error === "speech-timeout") {
          // Said when the session ends, unless words came first.
          missed.current = true;
          return;
        }
        const next = voiceErrorHint(event.error, Platform.OS);
        if (!next) return;
        say(next);
        if (event.error === "language-not-supported") {
          // No recognizer for this language: the hint stays and says why the mic
          // went, rather than a mic that never works.
          setSupported(false);
        }
      })
    ];
    return () => {
      for (const subscription of subscriptions) subscription.remove();
      try {
        module.abort();
      } catch {
        // Nothing was listening.
      }
    };
  }, [supported, say]);

  const start = useCallback(() => {
    const module = speechModule();
    if (!module || !enabled || busy.current) return;
    busy.current = true;
    released.current = false;
    startedAt.current = Date.now();
    base.current = latestText.current;
    heard.current = "";
    spoke.current = false;
    missed.current = false;
    say("");
    setListening(true);
    // The session never started: free the mic, with a word for the rider when there is one.
    const settle = (next?: string) => {
      busy.current = false;
      setListening(false);
      if (next) say(next);
    };
    void (async () => {
      const permission = await module.requestPermissionsAsync();
      if (!permission.granted) return settle(PERMISSION_HINT);
      // First use: the system prompts took the finger off the mic. Say it works now.
      if (released.current) return settle(READY_HINT);
      const lang = await speechLanguage(module);
      if (released.current) return settle();
      if (!lang) {
        settle(noLanguageHint(Platform.OS));
        setSupported(false);
        return;
      }
      module.start({
        lang,
        interimResults: true,
        continuous: true,
        requiresOnDeviceRecognition: true,
        addsPunctuation: true,
        iosTaskHint: "dictation",
        // Duck other apps' audio while listening instead of stopping it.
        iosCategory: {
          category: "playAndRecord",
          categoryOptions: ["defaultToSpeaker", "allowBluetooth", "duckOthers"],
          mode: "measurement"
        }
      });
    })().catch(() => settle(RETRY_HINT));
  }, [enabled, say]);

  const stop = useCallback(() => {
    const module = speechModule();
    released.current = true;
    // A tap is not a question: say how it works.
    if (Date.now() - startedAt.current < 350 && !heard.current) say(TAP_HINT);
    // The listening look goes as the finger lifts; the session ends a moment
    // later, and "end" lets the next press in.
    setListening(false);
    if (!module) return;
    try {
      module.stop();
    } catch {
      busy.current = false;
    }
    // Should "end" never come, the mic still frees up.
    const pressed = startedAt.current;
    setTimeout(() => {
      if (startedAt.current === pressed) busy.current = false;
    }, 4000);
  }, [say]);

  return { available: supported && enabled, listening, hint, start, stop };
}
