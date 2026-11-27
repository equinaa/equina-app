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
  if (Platform.OS === "web") return (loaded = null);
  try {
    loaded = (require("expo-speech-recognition") as SpeechPackage).ExpoSpeechRecognitionModule;
  } catch {
    loaded = null;
  }
  return loaded;
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
  const [available] = useState(voiceInputAvailable);
  const [listening, setListening] = useState(false);
  const [hint, setHint] = useState("");
  const base = useRef("");
  const heard = useRef("");
  const startedAt = useRef(0);
  // Let go before the permission answer came back: do not start after all.
  const released = useRef(false);
  const latestText = useRef(text);
  latestText.current = text;
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  useEffect(() => {
    const module = available ? speechModule() : null;
    if (!module) return;
    const subscriptions = [
      module.addListener("result", (event) => {
        const transcript = event.results[0]?.transcript ?? "";
        // Android hands each pause's words over as final, then starts again;
        // iOS keeps one growing transcript. Both end up as base + all heard.
        const shown = joinSpoken(heard.current, transcript);
        if (event.isFinal) heard.current = shown;
        onTextRef.current(joinSpoken(base.current, shown));
      }),
      module.addListener("end", () => setListening(false)),
      module.addListener("error", (event) => {
        setListening(false);
        if (event.error === "aborted" || event.error === "no-speech" || event.error === "speech-timeout") return;
        setHint(
          event.error === "not-allowed"
            ? "Allow the microphone and speech recognition in Settings to ask by voice."
            : "Couldn't hear that. Hold the mic and try again."
        );
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
  }, [available]);

  const start = useCallback(() => {
    const module = speechModule();
    if (!module || !enabled) return;
    released.current = false;
    startedAt.current = Date.now();
    base.current = latestText.current;
    heard.current = "";
    setHint("");
    setListening(true);
    void module.requestPermissionsAsync().then((permission) => {
      if (!permission.granted) {
        setListening(false);
        setHint("Allow the microphone and speech recognition in Settings to ask by voice.");
        return;
      }
      if (released.current) {
        setListening(false);
        return;
      }
      module.start({
        interimResults: true,
        continuous: true,
        requiresOnDeviceRecognition: true,
        addsPunctuation: true,
        iosTaskHint: "dictation"
      });
    }).catch(() => {
      setListening(false);
      setHint("Couldn't hear that. Hold the mic and try again.");
    });
  }, [enabled]);

  const stop = useCallback(() => {
    const module = speechModule();
    released.current = true;
    // A tap is not a question: say how it works.
    if (Date.now() - startedAt.current < 350 && !heard.current) setHint("Hold the mic while you speak.");
    if (!module) return;
    try {
      module.stop();
    } catch {
      setListening(false);
    }
  }, []);

  return { available: available && enabled, listening, hint, start, stop };
}
