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
import * as Clipboard from "expo-clipboard";
import { useAuth } from "@clerk/expo";
import { summarizeMessage } from "@/lib/pemApi";
import { Check, CheckCheck, ChevronDown, ChevronUp, Copy, FileText, Pause, Play, X } from "lucide-react-native";
import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ApiMessage } from "@/lib/pemApi";
import { pemImpactLight } from "@/lib/pemHaptics";
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
        const filled = progress > 0 && i / BAR_COUNT < progress;
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
  container: { flexDirection: "row", alignItems: "center", height: 24, gap: 1.5, flex: 1, overflow: "hidden" },
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
  const [showModal, setShowModal] = useState(false);
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
  const activeBarColor = pemAmber;
  const inactiveBarColor = isUser ? colors.userBubbleMeta : colors.borderMuted;
  const dimText = isUser ? colors.userBubbleMeta : colors.textTertiary;
  const playBtnBg = pemAmber;
  const playIcon = "#ffffff";
  const tickColor = isUser ? colors.userBubbleMeta : colors.textTertiary;
  const chipBg = isUser ? `${colors.userBubbleText}15` : colors.secondarySurface;
  const chipText = isUser ? colors.userBubbleMeta : colors.textSecondary;

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

          <View style={styles.controlsRight}>
            {showSpinner ? (
              <View style={styles.speedChipPlaceholder} />
            ) : (
              <Pressable onPress={cycleSpeed} hitSlop={8} style={[styles.speedChip, { backgroundColor: chipBg }]}>
                <Text style={[styles.speedChipText, { color: chipText }]}>
                  {SPEED_LABELS[speedIdx]}
                </Text>
              </Pressable>
            )}

            <Text style={[styles.durationText, { color: dimText }]}>
              {isPlaying || currentTime > 0 ? formatDuration(currentTime) : formatDuration(duration)}
            </Text>
          </View>
        </View>

        {/* Bottom row: left label + time/ticks */}
        <View style={styles.bottomRow}>
          {isUser && isSending && !transcript ? (
            <Text style={[styles.toggleText, { color: dimText, fontStyle: "italic" }]}>
              Transcribing...
            </Text>
          ) : transcript ? (
            <Pressable onPress={() => setShowModal(true)} hitSlop={8}>
              <Text style={[styles.toggleText, { color: dimText }]}>Transcript</Text>
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

      {transcript && (
        <TranscriptModal
          visible={showModal}
          text={transcript}
          messageId={message.id}
          existingSummary={message.summary}
          audioDuration={duration}
          onClose={() => setShowModal(false)}
        />
      )}
    </View>
  );
}

const SWIPE_CLOSE = 80;
const AUTO_SUMMARY_THRESHOLD_SEC = 60;

function TranscriptModal({
  visible,
  text,
  messageId,
  existingSummary,
  audioDuration,
  onClose,
}: {
  visible: boolean;
  text: string;
  messageId: string;
  existingSummary: string | null;
  audioDuration: number;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const { getToken } = useAuth();
  const insets = useSafeAreaInsets();
  const [copied, setCopied] = useState(false);
  const [summary, setSummary] = useState<string | null>(existingSummary ?? null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [transcriptExpanded, setTranscriptExpanded] = useState(false);
  const didAutoSummarize = useRef(false);

  const isLongEnough = audioDuration >= AUTO_SUMMARY_THRESHOLD_SEC;

  useEffect(() => {
    if (existingSummary) setSummary(existingSummary);
  }, [existingSummary]);

  const runSummarize = useCallback(async () => {
    if (summary || isSummarizing) return;
    setIsSummarizing(true);
    try {
      const res = await summarizeMessage(getToken, messageId);
      setSummary(res.summary);
    } catch {
      setSummary(null);
    } finally {
      setIsSummarizing(false);
    }
  }, [summary, isSummarizing, getToken, messageId]);

  useEffect(() => {
    if (!visible || didAutoSummarize.current || summary) return;
    if (!isLongEnough) return;
    didAutoSummarize.current = true;
    runSummarize();
  }, [visible, isLongEnough, summary, runSummarize]);

  const handleCopy = useCallback(() => {
    Clipboard.setStringAsync(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  const screenH = Dimensions.get("window").height;
  const sheetH = screenH - insets.top;

  const translateY = useRef(new Animated.Value(sheetH)).current;

  const animateIn = useCallback(() => {
    translateY.setValue(sheetH);
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      damping: 25,
      stiffness: 200,
    }).start();
  }, [translateY, sheetH]);

  const animateOut = useCallback(
    (cb?: () => void) => {
      Animated.timing(translateY, {
        toValue: sheetH,
        duration: 220,
        useNativeDriver: true,
      }).start(() => cb?.());
    },
    [translateY, sheetH],
  );

  const handleClose = useCallback(() => {
    animateOut(onClose);
  }, [animateOut, onClose]);

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(animateIn, 10);
    return () => clearTimeout(t);
  }, [visible, animateIn]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 10,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > SWIPE_CLOSE) {
          animateOut(onClose);
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            damping: 25,
            stiffness: 200,
          }).start();
        }
      },
    }),
  ).current;

  if (!visible) return null;

  const showSummarySection = isLongEnough;
  const showTranscriptDirectly = !isLongEnough;

  return (
    <Modal visible transparent animationType="none" onRequestClose={handleClose}>
      <Pressable style={sheetStyles.backdrop} onPress={handleClose}>
        <View />
      </Pressable>
      <Animated.View
        style={[
          sheetStyles.sheet,
          {
            height: sheetH,
            paddingBottom: insets.bottom,
            backgroundColor: colors.pageBackground,
            transform: [{ translateY }],
          },
        ]}
      >
        <View style={sheetStyles.topBar} {...panResponder.panHandlers}>
          <Text style={[sheetStyles.title, { color: colors.textPrimary }]}>Transcript</Text>
          <Pressable
            onPress={() => {
              pemImpactLight();
              handleClose();
            }}
            style={[sheetStyles.closeBtn, { backgroundColor: colors.secondarySurface }]}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close transcript"
          >
            <X size={18} color={colors.textSecondary} strokeWidth={2.5} />
          </Pressable>
        </View>
        <ScrollView
          style={sheetStyles.scroll}
          contentContainerStyle={sheetStyles.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator
        >
          {showSummarySection && (
            <>
              {isSummarizing && !summary && (
                <View style={[sheetStyles.summaryBlock, { backgroundColor: colors.secondarySurface }]}>
                  <View style={sheetStyles.summaryHeader}>
                    <View style={[sheetStyles.summaryAccent, { backgroundColor: pemAmber }]} />
                    <Text style={[sheetStyles.summaryLabel, { color: pemAmber }]}>Summary</Text>
                  </View>
                  <View style={sheetStyles.summarizingRow}>
                    <ActivityIndicator size={14} color={pemAmber} />
                    <Text style={[sheetStyles.summarizingText, { color: colors.textTertiary }]}>
                      Summarizing your thoughts...
                    </Text>
                  </View>
                </View>
              )}
              {summary && (
                <View style={[sheetStyles.summaryBlock, { backgroundColor: colors.secondarySurface }]}>
                  <View style={sheetStyles.summaryHeader}>
                    <View style={[sheetStyles.summaryAccent, { backgroundColor: pemAmber }]} />
                    <Text style={[sheetStyles.summaryLabel, { color: pemAmber }]}>Summary</Text>
                  </View>
                  <Text style={[sheetStyles.summaryText, { color: colors.textPrimary }]} selectable>
                    {summary}
                  </Text>
                </View>
              )}
              <View style={[sheetStyles.divider, { borderBottomColor: colors.borderMuted }]} />
              <Pressable
                onPress={() => setTranscriptExpanded((p) => !p)}
                style={sheetStyles.transcriptToggle}
              >
                <FileText size={15} color={colors.textTertiary} />
                <Text style={[sheetStyles.transcriptToggleText, { color: colors.textSecondary }]}>
                  {transcriptExpanded ? "Hide full transcript" : "Show full transcript"}
                </Text>
                {transcriptExpanded
                  ? <ChevronUp size={14} color={colors.textTertiary} />
                  : <ChevronDown size={14} color={colors.textTertiary} />
                }
              </Pressable>
              {transcriptExpanded && (
                <Text style={[sheetStyles.text, { color: colors.textPrimary }]} selectable>
                  {text}
                </Text>
              )}
            </>
          )}
          {showTranscriptDirectly && (
            <Text style={[sheetStyles.text, { color: colors.textPrimary }]} selectable>
              {text}
            </Text>
          )}
          <View style={sheetStyles.actionRow}>
            <Pressable
              onPress={handleCopy}
              style={[sheetStyles.actionBtn, { backgroundColor: colors.secondarySurface }]}
              hitSlop={8}
            >
              {copied ? (
                <Check size={14} color={pemAmber} strokeWidth={2.5} />
              ) : (
                <Copy size={14} color={colors.textSecondary} />
              )}
              <Text
                style={[
                  sheetStyles.actionBtnText,
                  { color: copied ? pemAmber : colors.textSecondary },
                ]}
              >
                {copied ? "Copied" : "Copy"}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const sheetStyles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 16,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space[4],
    paddingTop: space[3],
    paddingBottom: space[2],
  },
  title: {
    fontFamily: fontFamily.display.semibold,
    fontSize: fontSize.lg,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  body: {
    flexGrow: 1,
    paddingHorizontal: space[4],
    paddingBottom: space[6],
  },
  text: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.base,
    lineHeight: 24,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    marginTop: space[4],
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: space[3],
    paddingVertical: 8,
    borderRadius: radii.md,
  },
  actionBtnText: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.sm,
  },
  summaryBlock: {
    padding: space[3],
    paddingLeft: space[3] + 4,
    borderRadius: radii.md,
    marginBottom: space[2],
    position: "relative",
    overflow: "hidden",
  },
  summaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    marginBottom: space[2],
  },
  summaryAccent: {
    width: 3,
    height: 16,
    borderRadius: 1.5,
  },
  summaryLabel: {
    fontFamily: fontFamily.display.semibold,
    fontSize: fontSize.sm,
  },
  summaryText: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.base,
    lineHeight: 24,
    paddingLeft: 3 + space[2],
  },
  summarizingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    paddingLeft: 3 + space[2],
    paddingVertical: space[1],
  },
  summarizingText: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.sm,
  },
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginVertical: space[3],
  },
  transcriptToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    paddingVertical: space[2],
    marginBottom: space[2],
  },
  transcriptToggleText: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.sm,
    flex: 1,
  },
});

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
  controlsRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    flexShrink: 0,
    marginLeft: space[1],
  },
  speedChip: {
    width: 34,
    height: 22,
    borderRadius: 10,
    flexShrink: 0,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  speedChipText: {
    fontFamily: fontFamily.sans.medium,
    fontSize: 11,
    fontVariant: ["tabular-nums"],
    textAlign: "center" as const,
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
  durationText: {
    fontFamily: fontFamily.sans.regular,
    fontSize: 11,
    fontVariant: ["tabular-nums"],
    width: 32,
    textAlign: "right" as const,
  },
  toggleText: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.xs,
  },
});
