import { useTheme } from "@/contexts/ThemeContext";
import { pemAmber } from "@/constants/theme";
import { fontFamily, fontSize, space, radii } from "@/constants/typography";
import {
  useAudioPlayer,
  useAudioPlayerStatus,
  setAudioModeAsync,
} from "expo-audio";
import { Check, CheckCheck, Pause, Play } from "lucide-react-native";
import { useState, useCallback, useRef } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { ApiMessage } from "@/lib/pemApi";

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const BAR_COUNT = 32;
const SPEEDS = [1, 1.5, 2] as const;

function PlaybackWaveform({
  progress,
  activeColor,
  inactiveColor,
}: {
  progress: number;
  activeColor: string;
  inactiveColor: string;
}) {
  const heights = useRef(
    Array.from({ length: BAR_COUNT }, () => 3 + Math.random() * 18),
  ).current;

  return (
    <View style={waveStyles.container}>
      {heights.map((h, i) => {
        const filled = i / BAR_COUNT <= progress;
        return (
          <View
            key={i}
            style={[
              waveStyles.bar,
              {
                height: h,
                backgroundColor: filled ? activeColor : inactiveColor,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const waveStyles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    height: 24,
    gap: 1.5,
    flex: 1,
  },
  bar: { width: 2.5, borderRadius: 1.25 },
});

type Props = {
  message: ApiMessage & { _clientStatus?: "sending" | "sent" };
  isUser: boolean;
  isSending?: boolean;
};

export default function VoiceBubble({ message, isUser, isSending }: Props) {
  const { colors } = useTheme();
  const [showTranscript, setShowTranscript] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(0);

  const hasAudio = !!message.voice_url && !isSending;
  const player = useAudioPlayer(hasAudio ? message.voice_url! : undefined);
  const status = useAudioPlayerStatus(player);

  const bubbleBg = isUser ? colors.userBubble : colors.cardBackground;
  const textOnBubble = isUser ? colors.userBubbleText : colors.textPrimary;
  const activeBarColor = isUser ? colors.userBubbleText : pemAmber;
  const inactiveBarColor = isUser ? colors.userBubbleMeta : colors.borderMuted;
  const dimText = isUser ? colors.userBubbleMeta : colors.textTertiary;
  const playBtnBg = isUser ? `${colors.userBubbleText}15` : colors.secondarySurface;
  const playIcon = isUser ? colors.userBubbleText : colors.textPrimary;
  const tickColor = isUser ? colors.userBubbleMeta : colors.textTertiary;

  const duration = status.duration || 0;
  const currentTime = status.currentTime || 0;
  const progress = duration > 0 ? currentTime / duration : 0;
  const isPlaying = status.playing;
  const isLoaded = status.isLoaded;

  const togglePlay = useCallback(async () => {
    if (isPlaying) {
      player.pause();
    } else {
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });
      player.setPlaybackRate(SPEEDS[speedIdx]);
      player.play();
    }
  }, [isPlaying, player, speedIdx]);

  const cycleSpeed = useCallback(() => {
    const next = (speedIdx + 1) % SPEEDS.length;
    setSpeedIdx(next);
    if (player) {
      player.setPlaybackRate(SPEEDS[next]);
    }
  }, [speedIdx, player]);

  const time = new Date(message.created_at).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  const transcript = message.transcript ?? message.content;
  const showSpinner = isSending || (!isLoaded && hasAudio);

  return (
    <View style={[styles.row, isUser && styles.rowRight]}>
      <View
        style={[
          styles.bubble,
          { backgroundColor: bubbleBg },
          isUser ? styles.bubbleUser : styles.bubblePem,
          isSending && { opacity: 0.7 },
        ]}
      >
        <View style={styles.voiceRow}>
          {showSpinner ? (
            <View style={[styles.playBtn, { backgroundColor: playBtnBg }]}>
              <ActivityIndicator size="small" color={playIcon} />
            </View>
          ) : (
            <Pressable
              onPress={togglePlay}
              style={[styles.playBtn, { backgroundColor: playBtnBg }]}
            >
              {isPlaying ? (
                <Pause size={18} color={playIcon} strokeWidth={2.5} />
              ) : (
                <Play
                  size={18}
                  color={playIcon}
                  strokeWidth={2.5}
                  style={{ marginLeft: 2 }}
                />
              )}
            </Pressable>
          )}

          <View style={styles.waveCol}>
            <PlaybackWaveform
              progress={progress}
              activeColor={activeBarColor}
              inactiveColor={inactiveBarColor}
            />
            <View style={styles.metaRow}>
              <Text style={[styles.duration, { color: dimText }]}>
                {isPlaying || currentTime > 0
                  ? formatDuration(currentTime)
                  : formatDuration(duration)}
              </Text>
              {hasAudio && !showSpinner && (
                <Pressable onPress={cycleSpeed} hitSlop={6}>
                  <Text style={[styles.speedLabel, { color: dimText }]}>
                    {SPEEDS[speedIdx]}x
                  </Text>
                </Pressable>
              )}
              <View style={styles.timeTickRow}>
                <Text style={[styles.duration, { color: dimText }]}>
                  {time}
                </Text>
                {isUser &&
                  (isSending ? (
                    <Check size={13} color={tickColor} strokeWidth={2} />
                  ) : (
                    <CheckCheck size={13} color={tickColor} strokeWidth={2} />
                  ))}
              </View>
            </View>
          </View>
        </View>

        {transcript && (
          <Pressable
            onPress={() => setShowTranscript((v) => !v)}
            hitSlop={6}
          >
            <Text
              style={[
                styles.transcriptToggle,
                { color: isUser ? colors.userBubbleMeta : pemAmber },
              ]}
            >
              {showTranscript ? "Hide text" : "Show text"}
            </Text>
          </Pressable>
        )}

        {showTranscript && transcript && (
          <Text style={[styles.transcriptText, { color: textOnBubble }]}>
            {transcript}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    marginBottom: space[2],
    paddingHorizontal: space[3],
  },
  rowRight: { justifyContent: "flex-end" },
  bubble: {
    maxWidth: "85%",
    minWidth: "65%",
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    borderRadius: radii.lg,
  },
  bubbleUser: { borderBottomRightRadius: radii.sm },
  bubblePem: { borderBottomLeftRadius: radii.sm },
  voiceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
  },
  playBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  waveCol: { flex: 1 },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 3,
  },
  duration: {
    fontFamily: fontFamily.sans.regular,
    fontSize: 11,
    fontVariant: ["tabular-nums"],
  },
  speedLabel: {
    fontFamily: fontFamily.sans.medium,
    fontSize: 11,
    fontVariant: ["tabular-nums"],
  },
  timeTickRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  transcriptToggle: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.xs,
    marginTop: space[1],
  },
  transcriptText: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.sm,
    marginTop: space[1],
    lineHeight: 18,
  },
});
