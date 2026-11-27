import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { joinSpoken } from "./voice-text";

type SpeechPackage = typeof import("expo-speech-recognition");
type SpeechModule = SpeechPackage["ExpoSpeechRecognitionModule"];

// The package loads its native module as it is imported, and a build made
// before it was added has none: read it once, and treat a missing one as no voice.
let loaded: SpeechModule | null | undefined;
const speechModule = (): SpeechModule | null => {
  if (loaded !== undefined) return loaded;
  // Not on the web (the browser would send the audio away), and on Android
  // only from 13: before it the library falls back to the network service.
  if (Platform.OS === "web" || (Platform.OS === "android" && Number(Platform.Version) < 33)) return (loaded = null);
  try {
    loaded = (require("expo-speech-recognition") as SpeechPackage).ExpoSpeechRecognitionModule;
  } catch {
    loaded = null;
  }
  return loaded;
};

/**
 * The phone's language, which is the one its dictation knows and the one
 * the availability check looks at. Without it the library falls back to
 * en-US, whose on-device model may be missing.
 */
export const deviceSpeechLocale = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || "en-US";
  } catch {
    return "en-US";
  }
};

/** Whether this phone can turn speech into text without sending the audio anywhere. */
export const voiceInputAvailable = () => {
  const module = speechModule();
  if (!module) return false;
  try {
    return module.isRecognitionAvailable() && module.supportsOnDeviceRecognition();
  } catch {
    return false;
  }
};

const PERMISSION_HINT = "Allow the microphone and speech recognition in Settings to ask by voice.";
const RETRY_HINT = "Couldn't hear that. Hold the mic and try again.";

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
  const base = useRef("");
  const heard = useRef("");
  const startedAt = useRef(0);
  // From press to the session's "end": no second session meanwhile.
  const busy = useRef(false);
  // Let go before the session started (permission prompt, native start): stop it once it does.
  const released = useRef(false);
  const latestText = useRef(text);
  latestText.current = text;
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

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
        // Android hands each pause's words over as final, then starts again;
        // iOS keeps one growing transcript. Both end up as base + all heard.
        const shown = joinSpoken(heard.current, transcript);
        if (event.isFinal) heard.current = shown;
        onTextRef.current(joinSpoken(base.current, shown));
      }),
      module.addListener("end", finish),
      module.addListener("error", (event) => {
        finish();
        if (event.error === "aborted" || event.error === "no-speech" || event.error === "speech-timeout") return;
        if (event.error === "not-allowed") {
          setHint(PERMISSION_HINT);
          return;
        }
        if (event.error === "language-not-supported" || event.error === "service-not-allowed") {
          // This phone's language has no on-device model: no mic, rather than one that never works.
          setSupported(false);
          return;
        }
        setHint(RETRY_HINT);
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
  }, [supported]);

  const start = useCallback(() => {
    const module = speechModule();
    if (!module || !enabled || busy.current) return;
    busy.current = true;
    released.current = false;
    startedAt.current = Date.now();
    base.current = latestText.current;
    heard.current = "";
    setHint("");
    setListening(true);
    void module.requestPermissionsAsync().then((permission) => {
      if (!permission.granted) {
        busy.current = false;
        setListening(false);
        setHint(PERMISSION_HINT);
        return;
      }
      if (released.current) {
        busy.current = false;
        setListening(false);
        return;
      }
      module.start({
        lang: deviceSpeechLocale(),
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
    }).catch(() => {
      busy.current = false;
      setListening(false);
      setHint(RETRY_HINT);
    });
  }, [enabled]);

  const stop = useCallback(() => {
    const module = speechModule();
    released.current = true;
    // A tap is not a question: say how it works.
    if (Date.now() - startedAt.current < 350 && !heard.current) setHint("Hold the mic while you speak.");
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
  }, []);

  return { available: supported && enabled, listening, hint, start, stop };
}
