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
import { ArrowUp, Mic, Pause, Play, Send, Trash2 } from "lucide-react-native";
import { useState, useRef, useCallback, useEffect } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

const MAX_DURATION_S = 30 * 60;
const WAVEFORM_MAX_BARS = 48;

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

function LiveWaveform({
  levels,
  color,
  dimColor,
}: {
  levels: number[];
  color: string;
  dimColor: string;
}) {
  return (
    <View style={waveStyles.container}>
      {levels.map((h, i) => (
        <View
          key={i}
          style={[
            waveStyles.bar,
            {
              height: h,
              backgroundColor: i === levels.length - 1 ? color : dimColor,
            },
          ]}
        />
      ))}
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

type Props = {
  onSendText: (text: string) => void;
  onSendVoice: (audioUri: string) => Promise<void>;
  disabled?: boolean;
};

export default function ChatInput({
  onSendText,
  onSendVoice,
  disabled,
}: Props) {
  const { colors } = useTheme();
  const [text, setText] = useState("");
  const [mode, setMode] = useState<
    "idle" | "recording" | "paused" | "sending"
  >("idle");
  const inputRef = useRef<TextInput>(null);
  const recorder = useAudioRecorder(RECORDING_PRESET);
  const state = useAudioRecorderState(recorder, 100);
  const levelsRef = useRef<number[]>([]);
  const [levels, setLevels] = useState<number[]>([]);

  const hasText = text.trim().length > 0;
  const isRecMode = mode === "recording" || mode === "paused";
  const durationSec = state.durationMillis / 1000;

  useEffect(() => {
    if (mode !== "recording") return;
    const h = dbToHeight(state.metering);
    levelsRef.current = [...levelsRef.current.slice(-WAVEFORM_MAX_BARS + 1), h];
    setLevels([...levelsRef.current]);
  }, [state.durationMillis, state.metering, mode]);

  useEffect(() => {
    if (mode === "recording" && durationSec >= MAX_DURATION_S) {
      void handlePause();
    }
  }, [durationSec, mode]);

  useEffect(() => {
    if (mode === "idle") {
      levelsRef.current = [];
      setLevels([]);
    }
  }, [mode]);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSendText(trimmed);
    setText("");
    Keyboard.dismiss();
  };

  const handleStartRecording = useCallback(async () => {
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) return;
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setMode("recording");
    } catch (e) {
      console.warn("Recording start failed:", e);
    }
  }, [recorder]);

  const handlePause = useCallback(async () => {
    try {
      recorder.pause();
      setMode("paused");
    } catch (e) {
      console.warn("Pause failed:", e);
    }
  }, [recorder]);

  const handleResume = useCallback(async () => {
    try {
      recorder.record();
      setMode("recording");
    } catch (e) {
      console.warn("Resume failed:", e);
    }
  }, [recorder]);

  const handleCancel = useCallback(async () => {
    try {
      await recorder.stop();
    } catch {
      /* already stopped */
    }
    await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    setMode("idle");
  }, [recorder]);

  const handleSendVoice = useCallback(async () => {
    setMode("sending");
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
      const uri = recorder.uri;
      if (uri) {
        await onSendVoice(uri);
      }
    } catch (e) {
      console.warn("Voice send failed:", e);
    } finally {
      setMode("idle");
    }
  }, [recorder, onSendVoice]);

  if (isRecMode || mode === "sending") {
    return (
      <View style={styles.container}>
        <Pressable
          onPress={handleCancel}
          style={styles.recSideBtn}
          hitSlop={8}
          disabled={mode === "sending"}
        >
          <Trash2 size={20} color="#ff3b30" />
        </Pressable>

        <View
          style={[
            styles.recordingBar,
            { backgroundColor: colors.secondarySurface },
          ]}
        >
          <Pressable
            onPress={mode === "recording" ? handlePause : handleResume}
            style={styles.recPauseBtn}
            hitSlop={6}
            disabled={mode === "sending"}
          >
            {mode === "recording" ? (
              <Pause size={16} color={colors.textPrimary} strokeWidth={2.5} />
            ) : (
              <Play size={16} color={pemAmber} strokeWidth={2.5} />
            )}
          </Pressable>

          <LiveWaveform
            levels={levels}
            color={pemAmber}
            dimColor={`${pemAmber}88`}
          />

          <Text style={[styles.timer, { color: colors.textSecondary }]}>
            {formatTime(durationSec)}
          </Text>
        </View>

        <Pressable
          onPress={handleSendVoice}
          style={[styles.actionBtn, { backgroundColor: pemAmber }]}
          disabled={mode === "sending"}
        >
          {mode === "sending" ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Send size={18} color="#fff" strokeWidth={2.5} />
          )}
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View
        style={[styles.inputPill, { backgroundColor: colors.secondarySurface }]}
      >
        <TextInput
          ref={inputRef}
          value={text}
          onChangeText={setText}
          placeholder="Message Pem..."
          placeholderTextColor={colors.placeholder}
          style={[styles.input, { color: colors.textPrimary }]}
          multiline
          maxLength={8000}
          editable={!disabled}
          onSubmitEditing={Platform.OS === "web" ? handleSend : undefined}
          blurOnSubmit={false}
        />
      </View>

      {hasText ? (
        <Pressable
          onPress={handleSend}
          style={[styles.actionBtn, { backgroundColor: pemAmber }]}
          disabled={disabled}
        >
          <ArrowUp size={20} color="#fff" strokeWidth={2.5} />
        </Pressable>
      ) : (
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
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
