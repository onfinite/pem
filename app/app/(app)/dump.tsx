import DumpCloseBar from "@/components/sections/dump-sections/DumpCloseBar";
import PemLoadingIndicator from "@/components/ui/PemLoadingIndicator";
import PemText from "@/components/ui/PemText";
import { amber, pemAmber, surfacePage } from "@/constants/theme";
import { fontFamily, fontSize, lh, space } from "@/constants/typography";
import { useTheme } from "@/contexts/ThemeContext";
import { createDump, createVoiceDump } from "@/lib/pemApi";
import { useAuth } from "@clerk/expo";
import { Audio } from "expo-av";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ArrowUp, Mic, Pause, Square } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Mode = "idle" | "recording" | "paused" | "transcribing" | "text";

export default function DumpScreen() {
  const insets = useSafeAreaInsets();
  const { colors, resolved } = useTheme();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const { prefill: prefillParam } = useLocalSearchParams<{ prefill?: string | string[] }>();
  const prefill =
    typeof prefillParam === "string" ? prefillParam : Array.isArray(prefillParam) && prefillParam[0] ? prefillParam[0] : "";

  const [mode, setMode] = useState<Mode>(prefill ? "text" : "idle");
  const [draft, setDraft] = useState(prefill);
  const [submitting, setSubmitting] = useState(false);
  const [duration, setDuration] = useState(0);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<TextInput>(null);

  const trimmed = draft.trim();
  const canSend = trimmed.length > 0;

  const gradientColors = useMemo(
    (): readonly [string, string, string] =>
      resolved === "dark"
        ? [colors.brandMutedSurface, colors.cardBackground, colors.pageBackground]
        : [surfacePage, amber[50], amber[100]],
    [colors, resolved],
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      recordingRef.current?.stopAndUnloadAsync().catch(() => {});
    };
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Microphone access", "Pem needs mic access to record your voice dump.");
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      recordingRef.current = recording;
      setMode("recording");
      setDuration(0);
      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
    } catch {
      Alert.alert("Couldn't start recording", "Please check microphone permissions.");
    }
  }, []);

  const pauseRecording = useCallback(async () => {
    try {
      await recordingRef.current?.pauseAsync();
      setMode("paused");
      if (timerRef.current) clearInterval(timerRef.current);
    } catch {}
  }, []);

  const resumeRecording = useCallback(async () => {
    try {
      await recordingRef.current?.startAsync();
      setMode("recording");
      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
    } catch {}
  }, []);

  const stopAndTranscribe = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setMode("transcribing");
    try {
      await recordingRef.current?.stopAndUnloadAsync();
      const uri = recordingRef.current?.getURI();
      recordingRef.current = null;
      if (!uri) {
        setMode("idle");
        return;
      }
      const res = await createVoiceDump(() => getTokenRef.current(), uri);
      router.replace({ pathname: "/dump-confirmed", params: { dumpId: res.dumpId } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Transcription failed";
      Alert.alert("Couldn't process voice", msg);
      setMode("idle");
    }
  }, []);

  const submitText = useCallback(async () => {
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      const res = await createDump(() => getTokenRef.current(), trimmed);
      router.replace({ pathname: "/dump-confirmed", params: { dumpId: res.dumpId } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong.";
      Alert.alert("Couldn't send dump", msg);
    } finally {
      setSubmitting(false);
    }
  }, [trimmed, submitting]);

  const switchToText = useCallback(() => {
    setMode("text");
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const switchToVoice = useCallback(() => {
    Keyboard.dismiss();
    setMode("idle");
  }, []);

  const fmtDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const isVoiceMode = mode === "idle" || mode === "recording" || mode === "paused" || mode === "transcribing";

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.pageBackground }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StatusBar style={resolved === "dark" ? "light" : "dark"} />
      <LinearGradient colors={gradientColors} style={styles.gradient} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}>
        <View style={[styles.inner, { paddingTop: insets.top }]}>
          <DumpCloseBar />

          {(submitting || mode === "transcribing") ? (
            <View style={styles.overlay}>
              <PemLoadingIndicator placement="overlayLarge" />
              <PemText
                style={{
                  fontFamily: fontFamily.sans.regular,
                  fontSize: fontSize.sm,
                  color: colors.textSecondary,
                  marginTop: space[4],
                }}
              >
                {mode === "transcribing" ? "Transcribing..." : "Sending..."}
              </PemText>
            </View>
          ) : null}

          {isVoiceMode && mode !== "transcribing" ? (
            <View style={styles.voiceArea}>
              <PemText
                style={{
                  fontFamily: fontFamily.display.italic,
                  fontStyle: "italic",
                  fontSize: 22,
                  fontWeight: "200",
                  color: colors.textPrimary,
                  textAlign: "center",
                  lineHeight: lh(22, 1.4),
                }}
              >
                {mode === "idle" ? "What's on your mind?" : mode === "recording" ? "Listening..." : "Paused"}
              </PemText>

              {mode !== "idle" ? (
                <View style={styles.timerRow}>
                  {mode === "recording" ? <View style={styles.recDot} /> : null}
                  <PemText
                    style={{
                      fontFamily: fontFamily.sans.regular,
                      fontSize: 12,
                      color: colors.textSecondary,
                      letterSpacing: 0.5,
                    }}
                  >
                    {mode === "recording" ? "RECORDING" : "PAUSED"} · {fmtDuration(duration)}
                  </PemText>
                </View>
              ) : (
                <PemText
                  style={{
                    fontFamily: fontFamily.display.italic,
                    fontStyle: "italic",
                    fontSize: fontSize.md,
                    fontWeight: "200",
                    color: pemAmber,
                    textAlign: "center",
                  }}
                >
                  say anything
                </PemText>
              )}

              <View style={styles.micRow}>
                {mode === "recording" ? (
                  <>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Pause"
                      onPress={() => void pauseRecording()}
                      style={[styles.controlBtn, { borderColor: colors.borderMuted }]}
                    >
                      <Pause size={20} color={colors.textSecondary} strokeWidth={2} />
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Stop and send"
                      onPress={() => void stopAndTranscribe()}
                      style={styles.micBtn}
                    >
                      <Square size={22} color="#fff" strokeWidth={2} fill="#fff" />
                    </Pressable>
                    <View style={{ width: 48 }} />
                  </>
                ) : mode === "paused" ? (
                  <>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Resume"
                      onPress={() => void resumeRecording()}
                      style={[styles.controlBtn, { borderColor: colors.borderMuted }]}
                    >
                      <Mic size={20} color={pemAmber} strokeWidth={2} />
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Stop and send"
                      onPress={() => void stopAndTranscribe()}
                      style={styles.micBtn}
                    >
                      <ArrowUp size={22} color="#fff" strokeWidth={2.5} />
                    </Pressable>
                    <View style={{ width: 48 }} />
                  </>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Start recording"
                    onPress={() => void startRecording()}
                    style={styles.micBtn}
                  >
                    <Mic size={24} color="#fff" strokeWidth={2} />
                  </Pressable>
                )}
              </View>

              <Pressable accessibilityRole="button" onPress={switchToText}>
                <PemText
                  style={{
                    fontFamily: fontFamily.sans.regular,
                    fontSize: 12,
                    color: colors.textSecondary,
                    textDecorationLine: "underline",
                    textDecorationColor: colors.borderMuted,
                  }}
                >
                  or type it
                </PemText>
              </Pressable>
            </View>
          ) : mode === "text" ? (
            <View style={styles.textArea}>
              <TextInput
                ref={inputRef}
                value={draft}
                onChangeText={setDraft}
                placeholder="Type your dump..."
                placeholderTextColor={colors.placeholder}
                multiline
                maxLength={16_000}
                textAlignVertical="top"
                style={[
                  styles.textInput,
                  {
                    color: colors.textPrimary,
                    borderColor: colors.borderMuted,
                    fontFamily: fontFamily.sans.regular,
                  },
                ]}
              />
              <View style={styles.textBottomRow}>
                <Pressable accessibilityRole="button" onPress={switchToVoice}>
                  <Mic size={22} color={pemAmber} strokeWidth={2} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Send"
                  disabled={!canSend || submitting}
                  onPress={() => void submitText()}
                  style={[
                    styles.sendBtn,
                    {
                      backgroundColor: canSend ? pemAmber : colors.secondarySurface,
                      opacity: canSend && !submitting ? 1 : 0.5,
                    },
                  ]}
                >
                  <ArrowUp size={20} color={canSend ? "#fff" : colors.textSecondary} strokeWidth={2.5} />
                </Pressable>
              </View>
            </View>
          ) : null}

          <View style={{ height: Math.max(insets.bottom, space[4]) }} />
        </View>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gradient: { flex: 1 },
  inner: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  voiceArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space[5],
    paddingHorizontal: space[8],
  },
  timerRow: {
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
  micRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space[4],
    marginTop: space[4],
  },
  micBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: pemAmber,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: pemAmber,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  controlBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  textArea: {
    flex: 1,
    paddingHorizontal: space[5],
    gap: space[3],
  },
  textInput: {
    flex: 1,
    minHeight: 200,
    fontSize: 16,
    lineHeight: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  textBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sendBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
});
