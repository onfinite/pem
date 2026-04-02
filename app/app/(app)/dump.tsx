import DumpBottomBar from "@/components/sections/dump-sections/DumpBottomBar";
import DumpCloseBar from "@/components/sections/dump-sections/DumpCloseBar";
import DumpMainStage from "@/components/sections/dump-sections/DumpMainStage";
import { amber, surfacePage } from "@/constants/theme";
import { space } from "@/constants/typography";
import { usePrepHub } from "@/contexts/PrepHubContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useVoiceSpeechRecognition } from "@/hooks/useVoiceSpeechRecognition";
import { createDump } from "@/lib/pemApi";
import { useAuth } from "@clerk/expo";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  StyleSheet,
  TextInput,
  TouchableWithoutFeedback,
  UIManager,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type BottomMode = "voice" | "type";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/**
 * Voice: device speech-to-text (live captions) → same `POST /dumps` as typing.
 * Server Whisper is not real-time; optional `/dumps/audio` remains for file uploads.
 */
export default function DumpScreen() {
  const insets = useSafeAreaInsets();
  const { colors, resolved } = useTheme();
  const { getToken } = useAuth();
  const { refresh: refreshPreps } = usePrepHub();
  const [bottomMode, setBottomMode] = useState<BottomMode>("voice");
  const [draft, setDraft] = useState("");
  const [interim, setInterim] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const trimmedType = draft.trim();
  const canSendType = trimmedType.length > 0;
  const draftInputRef = useRef<TextInput>(null);

  const voiceDisplay = useMemo(() => {
    const i = interim.trim();
    if (!i) return draft;
    const base = draft.trimEnd();
    return base ? `${base} ${i}` : i;
  }, [draft, interim]);

  const textToSend = useMemo(() => {
    const i = interim.trim();
    const d = draft.trim();
    if (!i) return d;
    return d ? `${d} ${i}` : i;
  }, [draft, interim]);

  const {
    status: voiceStatus,
    start: voiceStart,
    pause: voicePause,
    resume: voiceResume,
    abort: voiceAbort,
  } = useVoiceSpeechRecognition({
    onInterim: setInterim,
    onFinal: (t) => {
      const add = t.trim();
      if (!add) return;
      setDraft((d) => (d.trim() ? `${d.trim()} ${add}` : add));
      setInterim("");
    },
    onError: (m) => Alert.alert("Voice", m),
  });

  useEffect(() => {
    return () => {
      voiceAbort();
    };
  }, [voiceAbort]);

  const gradientColors = useMemo(
    (): readonly [string, string, string] =>
      resolved === "dark"
        ? [colors.brandMutedSurface, colors.cardBackground, colors.pageBackground]
        : [surfacePage, amber[50], amber[100]],
    [colors, resolved],
  );

  const dismissKeyboardSoft = useCallback(() => {
    if (Platform.OS === "android") {
      LayoutAnimation.configureNext({
        duration: 240,
        update: { type: LayoutAnimation.Types.easeInEaseOut },
      });
    }
    Keyboard.dismiss();
  }, []);

  useEffect(() => {
    if (bottomMode !== "type") {
      draftInputRef.current?.blur();
      return;
    }
    const t = setTimeout(() => draftInputRef.current?.focus(), 48);
    return () => clearTimeout(t);
  }, [bottomMode]);

  useEffect(() => {
    return () => Keyboard.dismiss();
  }, []);

  const waveInactive = colors.border;

  const submitDump = useCallback(async () => {
    const payload = bottomMode === "voice" ? textToSend.trim() : draft.trim();
    if (!payload || submitting) return;
    if (bottomMode === "voice" && voiceStatus === "listening") {
      voicePause();
    }
    setSubmitting(true);
    try {
      await createDump(getToken, payload);
      await refreshPreps();
      router.replace("/prepping");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong.";
      Alert.alert("Couldn’t send dump", msg);
    } finally {
      setSubmitting(false);
    }
  }, [
    bottomMode,
    textToSend,
    draft,
    submitting,
    voiceStatus,
    voicePause,
    getToken,
    refreshPreps,
  ]);

  const onVoiceTranscriptChange = useCallback((t: string) => {
    setInterim("");
    setDraft(t);
  }, []);

  const onVoiceCenterPress = useCallback(async () => {
    if (voiceStatus === "idle") {
      await voiceStart();
      return;
    }
    if (voiceStatus === "listening") {
      voicePause();
      return;
    }
    await voiceResume();
  }, [voiceStatus, voiceStart, voicePause, voiceResume]);

  const onToggleMode = useCallback(() => {
    setBottomMode((prev) => {
      if (prev === "voice") {
        voiceAbort();
        setInterim("");
      }
      return prev === "voice" ? "type" : "voice";
    });
  }, [voiceAbort]);

  const onPrimarySend = useCallback(() => {
    void submitDump();
  }, [submitDump]);

  const canSend = bottomMode === "voice" ? textToSend.trim().length > 0 : canSendType;
  const sendActive = !submitting && canSend;

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.pageBackground }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StatusBar style={resolved === "dark" ? "light" : "dark"} />
      <LinearGradient
        colors={gradientColors}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <TouchableWithoutFeedback accessible={false} onPress={dismissKeyboardSoft}>
          <View style={styles.sheetInner}>
            <View style={{ paddingTop: insets.top }}>
              <DumpCloseBar />
            </View>

            {submitting ? (
              <View style={styles.submittingOverlay} accessibilityLabel="Sending dump">
                <ActivityIndicator size="large" color={colors.pemAmber} />
              </View>
            ) : null}

            <DumpMainStage
              bottomMode={bottomMode}
              pemAmber={colors.pemAmber}
              waveInactive={waveInactive}
              voiceTranscript={bottomMode === "voice" ? voiceDisplay : ""}
              onVoiceTranscriptChange={onVoiceTranscriptChange}
              voiceListening={bottomMode === "voice" && voiceStatus === "listening"}
            />

            <View style={{ paddingBottom: Math.max(insets.bottom, space[4]) }}>
              <DumpBottomBar
                bottomMode={bottomMode}
                onToggleMode={onToggleMode}
                draft={draft}
                onDraftChange={setDraft}
                draftInputRef={draftInputRef}
                canSend={canSend}
                sendActive={sendActive}
                onPrimarySend={onPrimarySend}
                submitting={submitting}
                voiceStatus={bottomMode === "voice" ? voiceStatus : "idle"}
                onVoiceCenterPress={() => void onVoiceCenterPress()}
              />
            </View>
          </View>
        </TouchableWithoutFeedback>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  sheetInner: {
    flex: 1,
  },
  submittingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
});
