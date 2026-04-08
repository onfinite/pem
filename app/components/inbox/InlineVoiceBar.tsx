import { inboxChrome } from "@/constants/inboxChrome";
import { pemAmber } from "@/constants/theme";
import { fontFamily, fontSize, space } from "@/constants/typography";
import {
  askPem,
  createDump,
  createVoiceAsk,
  createVoiceDump,
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
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type IntakeMode = "dump" | "ask";

type Props = {
  resolved: "light" | "dark";
  onDumpCreated?: (dumpId: string) => void;
  onDumpSuccess?: () => void;
  onPemResponse?: (answer: string, sources: { id: string; text: string }[]) => void;
  onThinking?: () => void;
  onThinkingDone?: () => void;
};

type BarMode = "idle" | "recording" | "paused" | "text";

export default function InlineVoiceBar({
  resolved,
  onDumpCreated,
  onDumpSuccess,
  onPemResponse,
  onThinking,
  onThinkingDone,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const chrome = inboxChrome(resolved);
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const modePagerW = windowWidth - space[4] * 2;
  const modeScrollRef = useRef<ScrollView>(null);
  const [intakeMode, setIntakeMode] = useState<IntakeMode>("dump");

  const [barMode, setBarMode] = useState<BarMode>("idle");
  const [text, setText] = useState("");
  const [duration, setDuration] = useState(0);
  const [sending, setSending] = useState(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<TextInput>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const scrollToMode = useCallback(
    (m: IntakeMode) => {
      modeScrollRef.current?.scrollTo({
        x: m === "dump" ? 0 : modePagerW,
        animated: true,
      });
    },
    [modePagerW],
  );

  const onModeScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const page = Math.round(x / modePagerW);
      setIntakeMode(page <= 0 ? "dump" : "ask");
    },
    [modePagerW],
  );

  useEffect(() => {
    if (barMode !== "recording") return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [barMode, pulseAnim]);

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
        Alert.alert("Microphone access", "Pem needs mic access to record.");
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      recordingRef.current = recording;
      setDuration(0);
      setBarMode("recording");
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
    setBarMode("idle");
    setDuration(0);
  }, []);

  const pauseRecording = useCallback(async () => {
    try {
      await recordingRef.current?.pauseAsync();
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      setBarMode("paused");
      pemImpactLight();
    } catch {}
  }, []);

  const resumeRecording = useCallback(async () => {
    try {
      await recordingRef.current?.startAsync();
      setBarMode("recording");
      pemImpactLight();
      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
    } catch {}
  }, []);

  const stopAndSend = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    const modeAtSend = intakeMode;
    setSending(true);
    try {
      await recordingRef.current?.stopAndUnloadAsync();
      const uri = recordingRef.current?.getURI();
      recordingRef.current = null;
      if (!uri) {
        setBarMode("idle");
        setSending(false);
        return;
      }
      pemImpactLight();
      setBarMode("idle");
      setDuration(0);

      if (modeAtSend === "dump") {
        onDumpSuccess?.();
      } else {
        onThinking?.();
      }

      const tokenFn = () => getTokenRef.current();
      if (modeAtSend === "dump") {
        createVoiceDump(tokenFn, uri)
          .then((res) => {
            pemNotificationSuccess();
            onDumpCreated?.(res.dumpId);
          })
          .catch(() => {})
          .finally(() => setSending(false));
      } else {
        createVoiceAsk(tokenFn, uri)
          .then((res) => {
            pemNotificationSuccess();
            onThinkingDone?.();
            onPemResponse?.(res.answer, res.sources);
          })
          .catch(() => {
            onThinkingDone?.();
          })
          .finally(() => setSending(false));
      }
    } catch (e) {
      if (modeAtSend === "ask") onThinkingDone?.();
      Alert.alert("Couldn't send", e instanceof Error ? e.message : "Recording failed");
      setBarMode("idle");
      setSending(false);
    }
  }, [
    intakeMode,
    onDumpCreated,
    onDumpSuccess,
    onPemResponse,
    onThinking,
    onThinkingDone,
  ]);

  const sendText = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    const modeAtSend = intakeMode;
    Keyboard.dismiss();
    setSending(true);
    setText("");
    setBarMode("idle");

    const tokenFn = () => getTokenRef.current();
    if (modeAtSend === "dump") {
      onDumpSuccess?.();
      createDump(tokenFn, trimmed)
        .then((res) => {
          pemNotificationSuccess();
          onDumpCreated?.(res.dumpId);
        })
        .catch(() => {})
        .finally(() => setSending(false));
    } else {
      onThinking?.();
      askPem(tokenFn, trimmed)
        .then((res) => {
          pemNotificationSuccess();
          onThinkingDone?.();
          onPemResponse?.(res.answer, res.sources);
        })
        .catch(() => onThinkingDone?.())
        .finally(() => setSending(false));
    }
  }, [
    text,
    sending,
    intakeMode,
    onDumpCreated,
    onDumpSuccess,
    onPemResponse,
    onThinking,
    onThinkingDone,
  ]);

  const hasText = text.trim().length > 0;
  const placeholder =
    intakeMode === "ask"
      ? "Ask Pem…"
      : "Brain dump, command, or thought…";

  return (
    <LinearGradient
      colors={[`${chrome.page}00`, chrome.page]}
      locations={[0, 0.45]}
      style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, space[4]) }]}
      pointerEvents="box-none"
    >
      <ScrollView
        ref={modeScrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        keyboardShouldPersistTaps="handled"
        onMomentumScrollEnd={onModeScrollEnd}
        style={{ width: modePagerW, alignSelf: "center", marginBottom: space[2] }}
        contentContainerStyle={{ width: modePagerW * 2 }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dump mode — swipe right for Ask"
          onPress={() => {
            pemImpactLight();
            setIntakeMode("dump");
            scrollToMode("dump");
          }}
          style={[styles.modePage, { width: modePagerW }]}
        >
          <PemTextChrome chrome={chrome} active={intakeMode === "dump"} bold>
            Dump
          </PemTextChrome>
          <PemTextChrome chrome={chrome} active={false} caption>
            Save & organize — fire and forget
          </PemTextChrome>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ask mode — swipe left for Dump"
          onPress={() => {
            pemImpactLight();
            setIntakeMode("ask");
            scrollToMode("ask");
          }}
          style={[styles.modePage, { width: modePagerW }]}
        >
          <PemTextChrome chrome={chrome} active={intakeMode === "ask"} bold>
            Ask
          </PemTextChrome>
          <PemTextChrome chrome={chrome} active={false} caption>
            Answer only — nothing saved as a dump
          </PemTextChrome>
        </Pressable>
      </ScrollView>

      <View style={[styles.bar, { borderColor: chrome.border, backgroundColor: chrome.surface }]}>
        {barMode === "recording" || barMode === "paused" ? (
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
              {barMode === "recording" ? (
                <Animated.View style={[styles.recDot, { opacity: pulseAnim }]} />
              ) : (
                <View style={[styles.recDot, { backgroundColor: chrome.textDim }]} />
              )}
              <TextInput
                editable={false}
                value={`${fmt(duration)}${barMode === "paused" ? " · paused" : ""}`}
                style={[styles.timerText, { color: chrome.text, fontFamily: fontFamily.sans.regular }]}
              />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={barMode === "recording" ? "Pause" : "Resume"}
              onPress={() => void (barMode === "recording" ? pauseRecording() : resumeRecording())}
              style={[styles.secondaryBtn, { borderColor: chrome.border }]}
            >
              {barMode === "recording" ? (
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
              onFocus={() => setBarMode("text")}
              onBlur={() => {
                if (!text.trim()) setBarMode("idle");
              }}
              placeholder={placeholder}
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

function PemTextChrome({
  children,
  chrome,
  active,
  bold,
  caption,
}: {
  children: string;
  chrome: ReturnType<typeof inboxChrome>;
  active: boolean;
  bold?: boolean;
  caption?: boolean;
}) {
  return (
    <Text
      style={{
        color: active ? chrome.text : chrome.textMuted,
        fontFamily: bold ? fontFamily.sans.semibold : fontFamily.sans.regular,
        fontSize: caption ? fontSize.xs : fontSize.md,
        fontWeight: bold ? "600" : "400",
        textAlign: "center",
        marginTop: caption ? 2 : 0,
      }}
    >
      {children}
    </Text>
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
  modePage: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: space[1],
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
