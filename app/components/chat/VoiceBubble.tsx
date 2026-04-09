import { useTheme } from "@/contexts/ThemeContext";
import { pemAmber } from "@/constants/theme";
import { fontFamily, fontSize, space, radii } from "@/constants/typography";
import {
  useAudioPlayer,
  useAudioPlayerStatus,
  setAudioModeAsync,
} from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";

// Configure audio session once for the entire app lifecycle.
setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});

/**
 * Download a remote audio URL to a stable local path keyed by messageId.
 * Returns the local URI immediately if already cached or if a local file is provided.
 */
async function ensureLocalAudio(
  messageId: string,
  remoteUrl: string,
): Promise<string> {
  const localPath = `${FileSystem.cacheDirectory}pem_voice_${messageId}.m4a`;
  const info = await FileSystem.getInfoAsync(localPath);
  if (info.exists) return localPath;
  const result = await FileSystem.downloadAsync(remoteUrl, localPath);
  return result.uri;
}
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Check, CheckCheck, Pause, Play } from "lucide-react-native";
import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { ApiMessage } from "@/lib/pemApi";

const SPEED_STORAGE_KEY = "@pem/voice_playback_speed_idx";
const SPEEDS = [1, 1.5, 2] as const;
const SPEED_LABELS = ["1×", "1.5×", "2×"] as const;
const BAR_COUNT = 32;

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Module-level cache so all bubbles share the same speed preference in-session
let cachedSpeedIdx: number | null = null;

async function loadSpeedIdx(): Promise<number> {
  if (cachedSpeedIdx !== null) return cachedSpeedIdx;
  try {
    const val = await AsyncStorage.getItem(SPEED_STORAGE_KEY);
    const parsed = val !== null ? parseInt(val, 10) : 0;
    cachedSpeedIdx = Number.isFinite(parsed) && parsed >= 0 && parsed < SPEEDS.length ? parsed : 0;
  } catch {
    cachedSpeedIdx = 0;
  }
  return cachedSpeedIdx!;
}

async function saveSpeedIdx(idx: number) {
  cachedSpeedIdx = idx;
  AsyncStorage.setItem(SPEED_STORAGE_KEY, String(idx)).catch(() => {});
}

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
              { height: h, backgroundColor: filled ? activeColor : inactiveColor },
            ]}
          />
        );
      })}
    </View>
  );
}

const waveStyles = StyleSheet.create({
  container: { flexDirection: "row", alignItems: "center", height: 24, gap: 1.5, flex: 1 },
  bar: { width: 2.5, borderRadius: 1.25 },
});

type Props = {
  message: ApiMessage & {
    _clientStatus?: "sending" | "sent" | "failed";
    _localUri?: string;
  };
  isUser: boolean;
  isSending?: boolean;
  isFailed?: boolean;
  onRetry?: () => void;
};

export default function VoiceBubble({ message, isUser, isSending, isFailed, onRetry }: Props) {
  const { colors } = useTheme();
  const transcript = message.transcript ?? message.content;
  const [showTranscript, setShowTranscript] = useState(!!transcript);
  const [speedIdx, setSpeedIdx] = useState(0);

  // Load persisted speed on mount
  useEffect(() => {
    loadSpeedIdx().then(setSpeedIdx);
  }, []);

  // Resolve to a stable local file URI before handing to the player.
  const [localUri, setLocalUri] = useState<string | null>(
    message._localUri ?? null,
  );
  const [downloadFailed, setDownloadFailed] = useState(false);
  const isDownloading = !isSending && !localUri && !downloadFailed && !!message.voice_url;

  useEffect(() => {
    if (isSending || message._localUri) return;
    if (!message.voice_url) return;
    let cancelled = false;
    setDownloadFailed(false);
    ensureLocalAudio(message.id, message.voice_url)
      .then((uri) => { if (!cancelled) setLocalUri(uri); })
      .catch((e) => {
        console.warn("[VoiceBubble] download error:", e);
        if (!cancelled) {
          // Fall back to remote URL so player can at least attempt streaming
          setLocalUri(message.voice_url!);
          setDownloadFailed(true);
        }
      });
    return () => { cancelled = true; };
  }, [message.id, message.voice_url, message._localUri, isSending]);

  // Audio source for the player — only pass a value once localUri is resolved
  const audioSource = localUri ?? undefined;
  const player = useAudioPlayer(audioSource, { keepAudioSessionActive: true });
  const status = useAudioPlayerStatus(player);

  const duration = status.duration || 0;
  const currentTime = status.currentTime || 0;
  const progress = duration > 0 ? currentTime / duration : 0;
  const isPlaying = status.playing;
  const isLoaded = status.isLoaded;

  // Timeout: if player hasn't loaded within 8s after localUri is set, give up on spinner.
  // This prevents the infinite-loading bug when the player silently fails to init.
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  useEffect(() => {
    if (!localUri || isLoaded) {
      setLoadTimedOut(false);
      return;
    }
    const timer = setTimeout(() => {
      if (!isLoaded) {
        console.warn("[VoiceBubble] player load timed out for", message.id);
        setLoadTimedOut(true);
      }
    }, 8000);
    return () => clearTimeout(timer);
  }, [localUri, isLoaded, message.id]);

  const showSpinner = isDownloading || (!!localUri && !isLoaded && !loadTimedOut);

  const togglePlay = useCallback(async () => {
    try {
      if (!isLoaded) {
        // Player didn't load — try replacing the source to force a re-init
        if (localUri) {
          setLoadTimedOut(false);
          player.replace({ uri: localUri });
        }
        return;
      }
      if (isPlaying) {
        player.pause();
      } else {
        if (duration > 0 && currentTime >= duration - 0.1) {
          await player.seekTo(0);
        }
        player.play();
      }
    } catch (e) {
      console.error("[VoiceBubble] play error:", e);
    }
  }, [isLoaded, isPlaying, player, duration, currentTime, localUri]);

  const cycleSpeed = useCallback(() => {
    const next = (speedIdx + 1) % SPEEDS.length;
    setSpeedIdx(next);
    saveSpeedIdx(next);
    if (isLoaded) {
      try { player.setPlaybackRate(SPEEDS[next]); } catch {}
    }
  }, [speedIdx, isLoaded, player]);

  const bubbleBg = isUser ? colors.userBubble : colors.cardBackground;
  const textOnBubble = isUser ? colors.userBubbleText : colors.textPrimary;
  const activeBarColor = isUser ? colors.userBubbleText : pemAmber;
  const inactiveBarColor = isUser ? colors.userBubbleMeta : colors.borderMuted;
  const dimText = isUser ? colors.userBubbleMeta : colors.textTertiary;
  const playBtnBg = isUser ? `${colors.userBubbleText}18` : colors.secondarySurface;
  const playIcon = isUser ? colors.userBubbleText : colors.textPrimary;
  const tickColor = isUser ? colors.userBubbleMeta : colors.textTertiary;
  const chipBg = isUser ? `${colors.userBubbleText}15` : colors.secondarySurface;
  const chipText = isUser ? colors.userBubbleMeta : colors.textSecondary;
  const toggleColor = isUser ? colors.userBubbleMeta : pemAmber;

  const time = new Date(message.created_at).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <View style={[styles.row, isUser && styles.rowRight]}>
      <View
        style={[
          styles.bubble,
          { backgroundColor: bubbleBg },
          isUser ? styles.bubbleUser : styles.bubblePem,
          isSending && { opacity: 0.7 },
          isFailed && { opacity: 0.6 },
        ]}
      >
        {/* Row 1: play · waveform · speed chip · duration */}
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
                <Play size={18} color={playIcon} strokeWidth={2.5} style={{ marginLeft: 2 }} />
              )}
            </Pressable>
          )}

          <PlaybackWaveform
            progress={progress}
            activeColor={activeBarColor}
            inactiveColor={inactiveBarColor}
          />

          {showSpinner ? (
            <View style={styles.speedChipPlaceholder} />
          ) : (
            <Pressable onPress={cycleSpeed} hitSlop={8} style={[styles.speedChip, { backgroundColor: chipBg }]}>
              <Text style={[styles.speedChipText, { color: chipText }]}>
                {SPEED_LABELS[speedIdx]}
              </Text>
            </Pressable>
          )}

          {/* Duration — to the right of speed chip */}
          <Text style={[styles.smallText, { color: dimText }]}>
            {isPlaying || currentTime > 0 ? formatDuration(currentTime) : formatDuration(duration)}
          </Text>
        </View>

        {/* Transcript */}
        {transcript && showTranscript && (
          <Text style={[styles.transcriptText, { color: textOnBubble }]}>
            {transcript}
          </Text>
        )}

        {/* Bottom row: hide/show text on left · message time + ticks on right */}
        <View style={styles.bottomRow}>
          {transcript ? (
            <Pressable onPress={() => setShowTranscript((v) => !v)} hitSlop={8}>
              <Text style={[styles.toggleText, { color: toggleColor }]}>
                {showTranscript ? "Hide text" : "Show text"}
              </Text>
            </Pressable>
          ) : (
            <View />
          )}
          <View style={styles.timeTickRow}>
            <Text style={[styles.smallText, { color: dimText }]}>{time}</Text>
            {isUser &&
              (isFailed ? (
                <Pressable onPress={onRetry} hitSlop={8}>
                  <Text style={{ fontFamily: fontFamily.sans.medium, fontSize: 11, color: "#ff3b30" }}>
                    Failed — retry
                  </Text>
                </Pressable>
              ) : isSending ? (
                <Check size={13} color={tickColor} strokeWidth={2} />
              ) : (
                <CheckCheck size={13} color={tickColor} strokeWidth={2} />
              ))}
          </View>
        </View>
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
    flexShrink: 0,
  },
  speedChip: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
    flexShrink: 0,
  },
  speedChipText: {
    fontFamily: fontFamily.sans.medium,
    fontSize: 11,
    fontVariant: ["tabular-nums"],
  },
  speedChipPlaceholder: {
    width: 34,
    flexShrink: 0,
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  timeTickRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  smallText: {
    fontFamily: fontFamily.sans.regular,
    fontSize: 11,
    fontVariant: ["tabular-nums"],
  },
  toggleText: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.xs,
  },
  transcriptText: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.sm,
    marginTop: space[2],
    lineHeight: 18,
  },
});
