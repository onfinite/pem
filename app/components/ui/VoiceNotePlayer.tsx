import PemText from "@/components/ui/PemText";
import type { InboxChrome } from "@/constants/inboxChrome";
import { fontFamily, space } from "@/constants/typography";
import { Audio, type AVPlaybackStatus } from "expo-av";
import { Pause, Play } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
} from "react-native";

function formatClock(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) return "0:00";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

type Props = {
  /** Load a playable URL (e.g. signed GET). */
  fetchUrl: () => Promise<string>;
  chrome: InboxChrome;
  accentColor?: string;
};

/**
 * WhatsApp-style voice note: play/pause, scrub on the bar, small remaining time bottom-right.
 */
export default function VoiceNotePlayer({
  fetchUrl,
  chrome,
  accentColor,
}: Props) {
  const fillColor = accentColor ?? chrome.text;
  const soundRef = useRef<Audio.Sound | null>(null);
  const durationMsRef = useRef(0);
  const positionMsRef = useRef(0);
  const isScrubbingRef = useRef(false);
  const wasPlayingBeforeScrubRef = useRef(false);
  const playingRef = useRef(false);
  const trackWidthRef = useRef(1);
  const gestureMovedRef = useRef(false);
  const grantXRef = useRef(0);
  const startRatioRef = useRef(0);
  const scrubDisplayRef = useRef(0);
  const ensureLoadedRef = useRef<() => Promise<boolean>>(async () => false);
  const seekToRatioRef = useRef<(ratio: number) => Promise<void>>(async () => {});

  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [durationMs, setDurationMs] = useState(0);
  const [positionMs, setPositionMs] = useState(0);
  const [scrubRatio, setScrubRatio] = useState<number | null>(null);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  const unload = useCallback(async () => {
    const s = soundRef.current;
    soundRef.current = null;
    durationMsRef.current = 0;
    positionMsRef.current = 0;
    setDurationMs(0);
    setPositionMs(0);
    setPlaying(false);
    setScrubRatio(null);
    if (s) await s.unloadAsync().catch(() => {});
  }, []);

  useEffect(() => {
    return () => {
      void unload();
    };
  }, [unload]);

  const onPlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    if (isScrubbingRef.current) return;
    durationMsRef.current = status.durationMillis ?? 0;
    positionMsRef.current = status.positionMillis ?? 0;
    setDurationMs(durationMsRef.current);
    setPositionMs(positionMsRef.current);
    setPlaying(status.isPlaying);
    playingRef.current = status.isPlaying;

    if (status.didJustFinish) {
      playingRef.current = false;
      setPlaying(false);
      positionMsRef.current = 0;
      setPositionMs(0);
      void soundRef.current?.setPositionAsync(0).catch(() => {});
    }
  }, []);

  const ensureLoaded = useCallback(async () => {
    if (soundRef.current) return true;
    setLoading(true);
    try {
      const uri = await fetchUrl();
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: false, progressUpdateIntervalMillis: 200 },
        onPlaybackStatusUpdate,
      );
      soundRef.current = sound;
      const st = await sound.getStatusAsync();
      if (st.isLoaded) {
        const d = st.durationMillis ?? 0;
        durationMsRef.current = d;
        setDurationMs(d);
      }
      return true;
    } catch {
      await unload();
      return false;
    } finally {
      setLoading(false);
    }
  }, [fetchUrl, onPlaybackStatusUpdate, unload]);

  const seekToRatio = useCallback(async (ratio: number) => {
    const s = soundRef.current;
    const dur = durationMsRef.current;
    if (!s || dur <= 0) return;
    const ms = Math.round(clamp(ratio, 0, 1) * dur);
    await s.setPositionAsync(ms);
    positionMsRef.current = ms;
    setPositionMs(ms);
  }, []);

  useEffect(() => {
    ensureLoadedRef.current = ensureLoaded;
  }, [ensureLoaded]);

  useEffect(() => {
    seekToRatioRef.current = seekToRatio;
  }, [seekToRatio]);

  const playFromStartIfNeeded = useCallback(async () => {
    const s = soundRef.current;
    if (!s) return;
    const st = await s.getStatusAsync();
    if (!st.isLoaded) return;
    const dur = st.durationMillis ?? 0;
    const pos = st.positionMillis ?? 0;
    const atEnd = dur > 0 && pos >= dur - 80;
    if (atEnd) await s.setPositionAsync(0);
  }, []);

  const togglePlay = useCallback(async () => {
    const ok = await ensureLoaded();
    if (!ok) return;
    const s = soundRef.current;
    if (!s) return;

    if (playingRef.current) {
      await s.pauseAsync();
      playingRef.current = false;
      setPlaying(false);
      return;
    }

    await playFromStartIfNeeded();
    await s.playAsync();
    playingRef.current = true;
    setPlaying(true);
  }, [ensureLoaded, playFromStartIfNeeded]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 6 || Math.abs(g.dy) < 10,
      onPanResponderGrant: async (e) => {
        const grantLocationX = e.nativeEvent?.locationX ?? 0;
        const ok = await ensureLoadedRef.current();
        if (!ok) return;
        isScrubbingRef.current = true;
        gestureMovedRef.current = false;
        grantXRef.current = grantLocationX;
        wasPlayingBeforeScrubRef.current = playingRef.current;
        const dur = durationMsRef.current;
        startRatioRef.current =
          dur > 0 ? positionMsRef.current / dur : 0;
        scrubDisplayRef.current = startRatioRef.current;
        setScrubRatio(startRatioRef.current);
        if (soundRef.current && playingRef.current) {
          await soundRef.current.pauseAsync();
          playingRef.current = false;
          setPlaying(false);
        }
      },
      onPanResponderMove: (_, g) => {
        if (Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2) gestureMovedRef.current = true;
        const w = Math.max(trackWidthRef.current, 1);
        const next = clamp(startRatioRef.current + g.dx / w, 0, 1);
        scrubDisplayRef.current = next;
        setScrubRatio(next);
      },
      onPanResponderRelease: async () => {
        const w = Math.max(trackWidthRef.current, 1);
        let ratio: number;
        if (!gestureMovedRef.current) {
          ratio = clamp(grantXRef.current / w, 0, 1);
        } else {
          ratio = scrubDisplayRef.current;
        }
        isScrubbingRef.current = false;
        setScrubRatio(null);
        await seekToRatioRef.current(ratio);
        if (wasPlayingBeforeScrubRef.current && soundRef.current) {
          await soundRef.current.playAsync();
          playingRef.current = true;
          setPlaying(true);
        }
      },
      onPanResponderTerminate: async () => {
        isScrubbingRef.current = false;
        setScrubRatio(null);
      },
    }),
  ).current;

  const effectiveRatio =
    scrubRatio ??
    (durationMs > 0 ? Math.min(1, positionMs / durationMs) : 0);
  const displayPosMs =
    scrubRatio != null ? scrubRatio * durationMs : positionMs;
  const remainingMs = Math.max(0, durationMs - displayPosMs);

  return (
    <View style={[styles.row, { borderColor: chrome.border, backgroundColor: chrome.surfaceMuted }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={playing ? "Pause" : "Play"}
        onPress={() => void togglePlay()}
        disabled={loading}
        style={[styles.playBtn, { borderColor: chrome.border }]}
      >
        {loading ? (
          <ActivityIndicator size="small" color={chrome.text} />
        ) : playing ? (
          <Pause size={18} color={chrome.text} strokeWidth={2} />
        ) : (
          <Play size={18} color={chrome.text} strokeWidth={2} style={{ marginLeft: 2 }} />
        )}
      </Pressable>

      <View style={styles.trackCol}>
        <View
          onLayout={(e) => {
            trackWidthRef.current = e.nativeEvent.layout.width;
          }}
          style={[styles.track, { backgroundColor: chrome.border }]}
          {...panResponder.panHandlers}
        >
          <View
            style={[
              styles.trackFill,
              {
                width: `${effectiveRatio * 100}%`,
                backgroundColor: fillColor,
              },
            ]}
          />
        </View>
        <View style={styles.remainingRow}>
          <PemText style={[styles.remainingText, { color: chrome.textDim }]}>
            {formatClock(remainingMs)}
          </PemText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: space[2],
    paddingVertical: space[2],
    paddingHorizontal: space[2],
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: space[2],
  },
  playBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  trackCol: {
    flex: 1,
    minWidth: 0,
  },
  track: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  trackFill: {
    height: "100%",
    borderRadius: 3,
  },
  remainingRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 2,
  },
  remainingText: {
    fontSize: 10,
    fontVariant: ["tabular-nums"],
    fontFamily: fontFamily.sans.regular,
  },
});
