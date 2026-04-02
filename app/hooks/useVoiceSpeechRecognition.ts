import { requireOptionalNativeModule } from "expo";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Platform } from "react-native";

const SPEECH_NATIVE_MODULE_NAME = "ExpoSpeechRecognition";

export type VoiceSpeechStatus = "idle" | "listening" | "paused";

type Options = {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onError?: (message: string) => void;
};

type SpeechPkg = typeof import("expo-speech-recognition");

/**
 * Loads expo-speech-recognition only when safe. Its native entry calls `requireNativeModule`, which
 * throws in Expo Go — and that throw is not reliably catchable with try/catch here, so we probe with
 * `requireOptionalNativeModule` first (native only). Web uses the package’s web shim, not that native name.
 */
function tryLoadSpeechPackage(): SpeechPkg | null {
  if (Platform.OS !== "web") {
    if (requireOptionalNativeModule(SPEECH_NATIVE_MODULE_NAME) == null) {
      return null;
    }
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-speech-recognition") as SpeechPkg;
  } catch {
    return null;
  }
}

/** On-device speech-to-text. Falls back gracefully when the native module is missing (e.g. Expo Go). */
export function useVoiceSpeechRecognition(opts: Options) {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const pkg = useMemo(() => tryLoadSpeechPackage(), []);

  const [status, setStatus] = useState<VoiceSpeechStatus>("idle");

  useEffect(() => {
    if (!pkg) return;
    const { ExpoSpeechRecognitionModule } = pkg;

    const onResult = (ev: {
      results: { transcript: string }[];
      isFinal: boolean;
    }) => {
      const t = ev.results[0]?.transcript ?? "";
      if (ev.isFinal) {
        optsRef.current.onFinal(t);
      } else {
        optsRef.current.onInterim(t);
      }
    };

    const onError = (ev: { error: string; message: string }) => {
      optsRef.current.onError?.(`${ev.error}: ${ev.message}`);
      setStatus("paused");
    };

    const subResult = ExpoSpeechRecognitionModule.addListener("result", onResult);
    const subError = ExpoSpeechRecognitionModule.addListener("error", onError);
    return () => {
      subResult.remove();
      subError.remove();
    };
  }, [pkg]);

  const startOptions = useCallback(() => {
    const androidApi =
      Platform.OS === "android" && typeof Platform.Version === "number"
        ? Platform.Version
        : 0;
    const continuous = Platform.OS === "ios" || androidApi >= 33;
    return {
      lang: "en-US",
      interimResults: true,
      continuous,
      addsPunctuation: true,
    } as const;
  }, []);

  const start = useCallback(async (): Promise<boolean> => {
    if (!pkg) {
      Alert.alert(
        "Voice",
        "Live dictation needs a development build with native code (Expo Go doesn’t include it). Run:\n\nnpx expo prebuild\nnpx expo run:ios\n\n(or run:android)\n\nYou can still type your dump with the keyboard.",
      );
      return false;
    }
    try {
      const perm = await pkg.ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) {
        optsRef.current.onError?.("Microphone or speech recognition permission denied.");
        return false;
      }
      pkg.ExpoSpeechRecognitionModule.start(startOptions());
      setStatus("listening");
      return true;
    } catch (e) {
      optsRef.current.onError?.(e instanceof Error ? e.message : String(e));
      return false;
    }
  }, [pkg, startOptions]);

  const pause = useCallback(() => {
    if (!pkg) return;
    try {
      pkg.ExpoSpeechRecognitionModule.stop();
    } catch {
      /* ignore */
    }
    optsRef.current.onInterim("");
    setStatus("paused");
  }, [pkg]);

  const resume = useCallback(async () => {
    await start();
  }, [start]);

  const abort = useCallback(() => {
    if (!pkg) {
      setStatus("idle");
      return;
    }
    try {
      pkg.ExpoSpeechRecognitionModule.abort();
    } catch {
      /* ignore */
    }
    optsRef.current.onInterim("");
    setStatus("idle");
  }, [pkg]);

  return { status, start, pause, resume, abort };
}
