import { useTheme } from "@/contexts/ThemeContext";
import { pemAmber } from "@/constants/theme";
import { fontFamily, fontSize, space, radii } from "@/constants/typography";
import {
  useAudioRecorder,
  useAudioRecorderState,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  IOSOutputFormat,
  AudioQuality,
  type RecordingOptions,
} from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import { pemImpactMedium } from "@/lib/pemHaptics";
import { ArrowUp, ImagePlus, Mic, Pause, Play, Send, Trash2 } from "lucide-react-native";
import { useState, useRef, useCallback, useEffect } from "react";
import {
  Alert,
  AppState,
  Keyboard,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { MAX_CHAT_MESSAGE_IMAGES } from "@/constants/chatPhotos.constants";
import { ChatPendingPhotoBar } from "./ChatPendingPhotoBar";

const MAX_DURATION_S = 30 * 60;
const WAVEFORM_MAX_BARS = 48;
const PENDING_RECORDING_PATH =
  FileSystem.cacheDirectory + "pending-recording.m4a";

const RECORDING_PRESET: RecordingOptions = {
  isMeteringEnabled: true,
  extension: ".m4a",
  sampleRate: 44100,
  numberOfChannels: 2,
  bitRate: 128000,
  android: { outputFormat: "mpeg4", audioEncoder: "aac" },
  ios: {
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.MAX,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: { mimeType: "audio/webm", bitsPerSecond: 128000 },
};

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function dbToHeight(db: number | undefined): number {
  if (db == null || db < -60) return 3;
  const normalized = Math.max(0, Math.min(1, (db + 60) / 60));
  return 3 + normalized * 25;
}

/** Single static line — matches common chat apps; rotating hints need long dwell + fade to feel calm. */
const COMPOSER_PLACEHOLDER = "Message Pem…";

type Props = {
  onSendText: (text: string) => void;
  onSendVoice: (audioUri: string) => void;
  onPickImage?: () => void;
  pendingImageUris?: string[];
  onRemovePendingImageAt?: (index: number) => void;
  onClearPendingImages?: () => void;
  disabled?: boolean;
};

export default function ChatInput({
  onSendText,
  onSendVoice,
  onPickImage,
  pendingImageUris = [],
  onRemovePendingImageAt,
  onClearPendingImages,
  disabled,
}: Props) {
  const { colors } = useTheme();
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"idle" | "recording" | "paused">("idle");
  const inputRef = useRef<TextInput>(null);

  const recorder = useAudioRecorder(RECORDING_PRESET);
  const recorderState = useAudioRecorderState(recorder, 100);

  // Persisted recording from a previous session
  const pendingFileRef = useRef<string | null>(null);

  // Waveform state
  const levelsRef = useRef<number[]>([]);
  const [levels, setLevels] = useState<number[]>([]);

  useEffect(() => {
    if (mode === "recording" && recorderState.isRecording) {
      const h = dbToHeight(recorderState.metering);
      levelsRef.current = [
        ...levelsRef.current.slice(-WAVEFORM_MAX_BARS + 1),
        h,
      ];
      setLevels([...levelsRef.current]);
    }
  }, [mode, recorderState.isRecording, recorderState.metering]);

  // JS-based timer — completely independent of native bridge
  const startTimeRef = useRef(0);
  const accumulatedRef = useRef(0);
  const [displaySec, setDisplaySec] = useState(0);

  useEffect(() => {
    if (mode !== "recording") return;
    const id = setInterval(() => {
      const elapsed = accumulatedRef.current + (Date.now() - startTimeRef.current);
      const sec = Math.floor(elapsed / 1000);
      setDisplaySec(sec);
      if (sec >= MAX_DURATION_S) {
        handlePause();
      }
    }, 250);
    return () => clearInterval(id);
  }, [mode]);

  // Restore a paused recording that was persisted before the app closed
  useEffect(() => {
    FileSystem.getInfoAsync(PENDING_RECORDING_PATH).then((info) => {
      if (info.exists) {
        pendingFileRef.current = PENDING_RECORDING_PATH;
        setMode("paused");
      }
    });
  }, []);

  const hasText = text.trim().length > 0;
  const isRecMode = mode === "recording" || mode === "paused";
  const hasPendingPhoto = pendingImageUris.length > 0;
  const isAtPhotoCap = pendingImageUris.length >= MAX_CHAT_MESSAGE_IMAGES;

  const handleSend = () => {
    const trimmed = text.trim();
    if (hasPendingPhoto) {
      onSendText(trimmed);
      setText("");
      Keyboard.dismiss();
      return;
    }
    if (!trimmed) return;
    onSendText(trimmed);
    setText("");
    Keyboard.dismiss();
  };

  const handleStartRecording = useCallback(async () => {
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Microphone access",
          "Pem needs microphone access for voice messages. Enable it in Settings.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Settings", onPress: () => Linking.openSettings() },
          ],
        );
        return;
      }
      pemImpactMedium();
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      levelsRef.current = [];
      setLevels([]);
      accumulatedRef.current = 0;
      startTimeRef.current = Date.now();
      setDisplaySec(0);
      setMode("recording");
    } catch (e) {
      console.warn("Recording start failed:", e);
    }
  }, [recorder]);

  const handlePause = useCallback(async () => {
    try {
      recorder.pause();
      accumulatedRef.current += Date.now() - startTimeRef.current;
      setMode("paused");

      const uri = recorder.uri;
      if (uri) {
        await FileSystem.copyAsync({ from: uri, to: PENDING_RECORDING_PATH });
        pendingFileRef.current = PENDING_RECORDING_PATH;
      }
    } catch (e) {
      console.warn("Pause failed:", e);
    }
  }, [recorder]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active" && mode === "recording") {
        handlePause();
      }
    });
    return () => sub.remove();
  }, [mode, handlePause]);

  const handleResume = useCallback(() => {
    try {
      recorder.record();
      startTimeRef.current = Date.now();
      pendingFileRef.current = null;
      setMode("recording");
    } catch (e) {
      console.warn("Resume failed:", e);
    }
  }, [recorder]);

  const handleCancel = useCallback(async () => {
    try { await recorder.stop(); } catch { /* ignore */ }
    await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    FileSystem.deleteAsync(PENDING_RECORDING_PATH, { idempotent: true }).catch(
      () => {},
    );
    pendingFileRef.current = null;
    accumulatedRef.current = 0;
    setDisplaySec(0);
    levelsRef.current = [];
    setLevels([]);
    setMode("idle");
  }, [recorder]);

  const handleSendVoice = useCallback(async () => {
    pemImpactMedium();
    if (mode === "recording") {
      accumulatedRef.current += Date.now() - startTimeRef.current;
    }
    try {
      await recorder.stop();
    } catch (e) {
      console.warn("Stop failed:", e);
    }
    await setAudioModeAsync({ allowsRecording: false }).catch(() => {});

    const uri = pendingFileRef.current ?? recorder.uri;
    // Go back to idle IMMEDIATELY — don't wait for upload
    pendingFileRef.current = null;
    accumulatedRef.current = 0;
    setDisplaySec(0);
    levelsRef.current = [];
    setLevels([]);
    setMode("idle");

    if (uri) {
      onSendVoice(uri);
    }

    FileSystem.deleteAsync(PENDING_RECORDING_PATH, { idempotent: true }).catch(
      () => {},
    );
  }, [recorder, onSendVoice, mode]);

  if (isRecMode) {
    return (
      <View style={styles.outer}>
        {hasPendingPhoto && onRemovePendingImageAt && onClearPendingImages ? (
          <ChatPendingPhotoBar
            uris={pendingImageUris}
            onRemoveAt={onRemovePendingImageAt}
            onClearAll={onClearPendingImages}
          />
        ) : null}
        <View style={styles.container}>
        <Pressable onPress={handleCancel} style={styles.recSideBtn} hitSlop={8}>
          <Trash2 size={20} color="#ff3b30" />
        </Pressable>

        <View style={[styles.recordingBar, { backgroundColor: colors.secondarySurface }]}>
          <Pressable
            onPress={mode === "recording" ? handlePause : handleResume}
            style={styles.recPauseBtn}
            hitSlop={6}
          >
            {mode === "recording" ? (
              <Pause size={16} color={colors.textPrimary} strokeWidth={2.5} />
            ) : (
              <Play size={16} color={pemAmber} strokeWidth={2.5} />
            )}
          </Pressable>

          <View style={waveStyles.container}>
            {levels.map((h, i) => (
              <View
                key={i}
                style={[
                  waveStyles.bar,
                  {
                    height: h,
                    backgroundColor: i === levels.length - 1 ? pemAmber : `${pemAmber}88`,
                  },
                ]}
              />
            ))}
          </View>

          <Text style={[styles.timer, { color: colors.textSecondary }]}>
            {formatTime(displaySec)}
          </Text>
        </View>

        <Pressable
          onPress={handleSendVoice}
          style={[styles.actionBtn, { backgroundColor: pemAmber }]}
        >
          <Send size={18} color="#fff" strokeWidth={2.5} />
        </Pressable>
        </View>
      </View>
    );
  }

  const isSendDisabled = Boolean(disabled || (!hasPendingPhoto && !hasText));
  const showSend = hasText || hasPendingPhoto;
  const showMicWithPending = hasPendingPhoto;

  return (
    <View style={styles.outer}>
      {hasPendingPhoto && onRemovePendingImageAt && onClearPendingImages ? (
        <ChatPendingPhotoBar
          uris={pendingImageUris}
          onRemoveAt={onRemovePendingImageAt}
          onClearAll={onClearPendingImages}
        />
      ) : null}
      <View style={styles.container}>
        {onPickImage ? (
          <Pressable
            onPress={onPickImage}
            style={[styles.sideBtn, { backgroundColor: colors.secondarySurface }]}
            disabled={disabled || isAtPhotoCap}
            hitSlop={6}
          >
            <ImagePlus size={20} color={pemAmber} strokeWidth={2} />
          </Pressable>
        ) : null}
        <View style={[styles.inputPill, { backgroundColor: colors.secondarySurface }]}>
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={setText}
            placeholder={COMPOSER_PLACEHOLDER}
            placeholderTextColor={colors.placeholder}
            style={[styles.input, { color: colors.textPrimary }]}
            multiline
            maxLength={8000}
            editable={!disabled}
            onSubmitEditing={Platform.OS === "web" ? handleSend : undefined}
            blurOnSubmit={false}
          />
        </View>

        {showMicWithPending ? (
          <View style={styles.dualActions}>
            <Pressable
              onPress={handleSend}
              style={[
                styles.actionBtn,
                {
                  backgroundColor: isSendDisabled
                    ? colors.borderMuted
                    : pemAmber,
                },
              ]}
              disabled={isSendDisabled}
            >
              <ArrowUp
                size={20}
                color={isSendDisabled ? colors.textTertiary : "#fff"}
                strokeWidth={2.5}
              />
            </Pressable>
            <Pressable
              onPress={handleStartRecording}
              style={[
                styles.actionBtn,
                { backgroundColor: colors.secondarySurface },
              ]}
              disabled={disabled}
            >
              <Mic size={20} color={pemAmber} strokeWidth={2} />
            </Pressable>
          </View>
        ) : showSend ? (
          <Pressable
            onPress={handleSend}
            style={[
              styles.actionBtn,
              {
                backgroundColor: isSendDisabled ? colors.borderMuted : pemAmber,
              },
            ]}
            disabled={isSendDisabled}
          >
            <ArrowUp
              size={20}
              color={isSendDisabled ? colors.textTertiary : "#fff"}
              strokeWidth={2.5}
            />
          </Pressable>
        ) : (
          <Pressable
            onPress={handleStartRecording}
            style={[styles.actionBtn, { backgroundColor: colors.secondarySurface }]}
            disabled={disabled}
          >
            <Mic size={20} color={pemAmber} strokeWidth={2} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const waveStyles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    height: 28,
    gap: 1.5,
    flex: 1,
  },
  bar: { width: 2.5, borderRadius: 1.25 },
});

const styles = StyleSheet.create({
  outer: { width: "100%" },
  dualActions: { flexDirection: "row", alignItems: "flex-end", gap: space[2] },
  container: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: space[2],
    paddingTop: space[1],
    paddingBottom: space[1],
    gap: space[2],
  },
  inputPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radii.xl,
    paddingHorizontal: space[3],
    paddingVertical: Platform.OS === "ios" ? space[2] : space[1],
    minHeight: 44,
  },
  input: {
    flex: 1,
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.base,
    maxHeight: 120,
    paddingVertical: Platform.OS === "ios" ? 0 : space[1],
  },
  actionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  sideBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  recordingBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radii.xl,
    paddingHorizontal: space[2],
    paddingVertical: space[2],
    minHeight: 44,
    gap: space[2],
  },
  recSideBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  recPauseBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  timer: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.xs,
    fontVariant: ["tabular-nums"],
    minWidth: 34,
    textAlign: "right",
  },
});
