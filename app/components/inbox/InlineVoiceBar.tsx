import { inboxChrome } from "@/constants/inboxChrome";
import { pemAmber } from "@/constants/theme";
import { fontFamily, fontSize, space } from "@/constants/typography";
import {
  createIntake,
  createVoiceIntake,
  type IntakeResponse,
} from "@/lib/pemApi";
import { pemImpactLight, pemNotificationSuccess } from "@/lib/pemHaptics";
import { useAuth } from "@clerk/expo";
import { Audio } from "expo-av";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowUp, Mic, Pause, X } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Keyboard,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const Q_STARTERS = /^(what|when|where|who|why|how|do|does|is|are|can|could|will|would|should|did|has|have)\b/i;

function looksLikeQuestion(text: string): boolean {
  const t = text.trim();
  if (t.endsWith("?")) return true;
  if (Q_STARTERS.test(t)) return true;
  return false;
}

type Props = {
  resolved: "light" | "dark";
  onDumpCreated?: (dumpId: string) => void;
  onDumpSuccess?: () => void;
  onPemResponse?: (answer: string, sources: { id: string; text: string }[]) => void;
  onThinking?: () => void;
  onThinkingDone?: () => void;
};

type Mode = "idle" | "recording" | "paused" | "text";

export default function InlineVoiceBar({ resolved, onDumpCreated, onDumpSuccess, onPemResponse, onThinking, onThinkingDone }: Props) {
  const insets = useSafeAreaInsets();
  const chrome = inboxChrome(resolved);
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const [mode, setMode] = useState<Mode>("idle");
  const [text, setText] = useState("");
  const [duration, setDuration] = useState(0);
  const [sending, setSending] = useState(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<TextInput>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (mode !== "recording") return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [mode, pulseAnim]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      recordingRef.current?.stopAndUnloadAsync().catch(() => {});
    };
  }, []);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  const startRecording = useCallback(async () => {
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Microphone access", "Pem needs mic access to record your thoughts.");
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      recordingRef.current = recording;
      setDuration(0);
      setMode("recording");
      pemImpactLight();
      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
    } catch {
      Alert.alert("Recording failed", "Please check microphone permissions.");
    }
  }, []);

  const cancelRecording = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    try {
      await recordingRef.current?.stopAndUnloadAsync();
    } catch {}
    recordingRef.current = null;
    setMode("idle");
    setDuration(0);
  }, []);

  const pauseRecording = useCallback(async () => {
    try {
      await recordingRef.current?.pauseAsync();
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      setMode("paused");
      pemImpactLight();
    } catch {}
  }, []);

  const resumeRecording = useCallback(async () => {
    try {
      await recordingRef.current?.startAsync();
      setMode("recording");
      pemImpactLight();
      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
    } catch {}
  }, []);

  const handleIntakeResult = useCallback(
    (res: IntakeResponse) => {
      if (res.dump_id) onDumpCreated?.(res.dump_id);
      if ((res.intent === "question" || res.intent === "both") && res.answer) {
        onPemResponse?.(res.answer, res.sources);
      }
    },
    [onDumpCreated, onPemResponse],
  );

  const stopAndSend = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setSending(true);
    try {
      await recordingRef.current?.stopAndUnloadAsync();
      const uri = recordingRef.current?.getURI();
      recordingRef.current = null;
      if (!uri) { setMode("idle"); setSending(false); return; }
      pemImpactLight();
      setMode("idle");
      setDuration(0);
      onDumpSuccess?.();
      createVoiceIntake(() => getTokenRef.current(), uri)
        .then((res) => { pemNotificationSuccess(); handleIntakeResult(res); })
        .catch(() => {})
        .finally(() => setSending(false));
    } catch (e) {
      Alert.alert("Couldn't send", e instanceof Error ? e.message : "Recording failed");
      setMode("idle");
      setSending(false);
    }
  }, [handleIntakeResult, onDumpSuccess]);

  const sendText = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    Keyboard.dismiss();
    setSending(true);
    setText("");
    setMode("idle");

    if (looksLikeQuestion(trimmed)) {
      onThinking?.();
      createIntake(() => getTokenRef.current(), trimmed)
        .then((res) => {
          pemNotificationSuccess();
          onThinkingDone?.();
          handleIntakeResult(res);
          if (res.dump_id && !res.answer) onDumpSuccess?.();
        })
        .catch(() => onThinkingDone?.())
        .finally(() => setSending(false));
    } else {
      onDumpSuccess?.();
      createIntake(() => getTokenRef.current(), trimmed)
        .then((res) => { pemNotificationSuccess(); handleIntakeResult(res); })
        .catch(() => {})
        .finally(() => setSending(false));
    }
  }, [text, sending, handleIntakeResult, onDumpSuccess, onThinking, onThinkingDone]);

  const hasText = text.trim().length > 0;

  return (
    <LinearGradient
      colors={[`${chrome.page}00`, chrome.page]}
      locations={[0, 0.45]}
      style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, space[4]) }]}
      pointerEvents="box-none"
    >
      <View style={[styles.bar, { borderColor: chrome.border, backgroundColor: chrome.surface }]}>
        {mode === "recording" || mode === "paused" ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel recording"
              onPress={() => void cancelRecording()}
              hitSlop={8}
              style={styles.cancelBtn}
            >
              <X size={20} color={chrome.textMuted} strokeWidth={2} />
            </Pressable>
            <View style={styles.timerRow}>
              {mode === "recording" ? (
                <Animated.View style={[styles.recDot, { opacity: pulseAnim }]} />
              ) : (
                <View style={[styles.recDot, { backgroundColor: chrome.textDim }]} />
              )}
              <TextInput
                editable={false}
                value={`${fmt(duration)}${mode === "paused" ? " · paused" : ""}`}
                style={[styles.timerText, { color: chrome.text, fontFamily: fontFamily.sans.regular }]}
              />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={mode === "recording" ? "Pause" : "Resume"}
              onPress={() => void (mode === "recording" ? pauseRecording() : resumeRecording())}
              style={[styles.secondaryBtn, { borderColor: chrome.border }]}
            >
              {mode === "recording" ? (
                <Pause size={16} color={chrome.text} strokeWidth={2} />
              ) : (
                <Mic size={16} color={pemAmber} strokeWidth={2} />
              )}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send recording"
              onPress={() => void stopAndSend()}
              disabled={sending}
              style={[styles.actionBtn, { backgroundColor: pemAmber, opacity: sending ? 0.5 : 1 }]}
            >
              <ArrowUp size={20} color="#fff" strokeWidth={2.5} />
            </Pressable>
          </>
        ) : (
          <>
            <TextInput
              ref={inputRef}
              value={text}
              onChangeText={setText}
              onFocus={() => setMode("text")}
              onBlur={() => { if (!text.trim()) setMode("idle"); }}
              placeholder="What's on your mind?"
              placeholderTextColor={chrome.textDim}
              maxLength={4000}
              multiline
              style={[styles.input, { color: chrome.text, fontFamily: fontFamily.sans.regular }]}
            />
            {hasText ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send"
                onPress={() => void sendText()}
                disabled={sending}
                style={[styles.actionBtn, { backgroundColor: pemAmber, opacity: sending ? 0.5 : 1 }]}
              >
                <ArrowUp size={20} color="#fff" strokeWidth={2.5} />
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Record voice"
                onPress={() => void startRecording()}
                style={[styles.actionBtn, { backgroundColor: pemAmber }]}
              >
                <Mic size={20} color="#fff" strokeWidth={2} />
              </Pressable>
            )}
          </>
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: space[4],
    paddingTop: space[6],
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 24,
    paddingLeft: space[4],
    paddingRight: space[1],
    paddingVertical: space[1],
    gap: space[2],
    minHeight: 48,
  },
  input: {
    flex: 1,
    fontSize: fontSize.base,
    maxHeight: 100,
    paddingVertical: 6,
  },
  cancelBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  timerRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  recDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#ff453a",
  },
  timerText: {
    fontSize: fontSize.sm,
    padding: 0,
  },
  secondaryBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
});
