import type { Prep } from "@/components/sections/home-sections/homePrepData";
import PemButton from "@/components/ui/PemButton";
import PemLoadingIndicator from "@/components/ui/PemLoadingIndicator";
import PemText from "@/components/ui/PemText";
import { useInboxShell } from "@/constants/shellTokens";
import { fontFamily, fontSize, lh, lineHeight, space } from "@/constants/typography";
import { useTheme } from "@/contexts/ThemeContext";
import { INBOX_ROW_PAD_H } from "@/components/sections/home-sections/homeLayout";
import { formatRelativeHubTime } from "@/lib/formatRelativeHubTime";
import { prepListAccentFromIntent, prepListIconFromIntent } from "@/components/shell/prepTypeIcon";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { Check, Star } from "lucide-react-native";

type Mode = "ready" | "done" | "prepping" | "archived";

type Props = {
  prep: Prep;
  mode: Mode;
  isLast: boolean;
  onOpen: () => void;
  onRetry?: (id: string) => Promise<void>;
  /** Hub multi-select — tap toggles; long-press enters selection. */
  selectionMode?: boolean;
  selected?: boolean;
  onLongPress?: () => void;
  /** Gmail-style star; hidden in selection mode and while the prep is still prepping. */
  starred?: boolean;
  onStarPress?: () => void;
};

const ICON_WELL = 36;
const CHECK_COL = 28;
const ROW_PAD_H = INBOX_ROW_PAD_H;

/**
 * Gmail-style inbox row: hairline separator, bold when unread on Ready.
 * Prepping rows match Ready styling plus a trailing spinner; hub does not open detail until ready.
 */
export default function PrepInboxRow({
  prep,
  mode,
  isLast,
  onOpen,
  onRetry,
  selectionMode = false,
  selected = false,
  onLongPress,
  starred = false,
  onStarPress,
}: Props) {
  const s = useInboxShell();
  const { colors, resolved } = useTheme();
  const accent = prepListAccentFromIntent(prep.intent ?? null, prep.kind, resolved);
  const isPrepping = mode === "prepping";
  const isArchived = mode === "archived";
  const isDone = mode === "done";
  const unread = mode === "ready" && prep.unread === true;
  const failed = prep.status === "failed";
  const Icon = prepListIconFromIntent(prep.intent ?? null, prep.kind);
  const [retrying, setRetrying] = useState(false);

  const ts = formatRelativeHubTime(prep.createdAt) ?? "";
  const teaser = isPrepping
    ? failed
      ? "Something went wrong."
      : "Pem is working on this…"
    : prep.summary;

  const rowTapActive = !isPrepping || selectionMode;
  const sepMarginLeft =
    ROW_PAD_H + (selectionMode ? CHECK_COL + space[3] : 0) + ICON_WELL + space[4];

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          isPrepping && !selectionMode
            ? `${prep.title}. ${teaser}. Opens when ready.`
            : `${prep.title}. ${prep.summary}`
        }
        accessibilityState={{ selected: selectionMode ? selected : undefined }}
        onPress={onOpen}
        onLongPress={onLongPress}
        delayLongPress={400}
        android_ripple={rowTapActive ? undefined : null}
        style={({ pressed }) => [
          styles.row,
          {
            backgroundColor: s.bg,
            opacity:
              isDone ? 0.72 : isArchived ? 0.82 : rowTapActive && pressed ? 0.94 : 1,
          },
        ]}
      >
        {selectionMode ? (
          <View
            style={[
              styles.checkWell,
              {
                borderColor: selected ? s.amber : s.border,
                backgroundColor: selected ? s.amber : "transparent",
              },
            ]}
          >
            {selected ? <Check size={16} color={colors.onPrimary} strokeWidth={3} /> : null}
          </View>
        ) : null}

        <View style={[styles.iconWell, { backgroundColor: accent.well }]}>
          <Icon size={20} color={accent.icon} strokeWidth={2.1} />
        </View>

        <View style={styles.body}>
          <View style={styles.row1}>
            <PemText
              numberOfLines={1}
              style={[
                styles.title,
                {
                  color:
                    isPrepping || isDone
                      ? s.textTertiary
                      : unread
                        ? s.textPrimary
                        : s.textSecondary,
                },
                unread && !isPrepping && !isDone && { fontFamily: fontFamily.sans.bold },
              ]}
            >
              {prep.title}
            </PemText>
            {ts ? (
              <PemText variant="caption" style={[styles.ts, { color: s.textTertiary }]}>
                {ts}
              </PemText>
            ) : null}
          </View>
          <PemText
            variant="caption"
            numberOfLines={1}
            style={[styles.italicMeta, { color: s.textTertiary, fontFamily: fontFamily.sans.italic }]}
          >
            {prep.tag}
          </PemText>
          <View style={styles.teaserRow}>
            <PemText
              numberOfLines={1}
              style={[
                styles.teaser,
                {
                  color: isDone ? s.textTertiary : s.textSecondary,
                  fontFamily: fontFamily.sans.regular,
                },
              ]}
            >
              {teaser}
            </PemText>
            {isPrepping && failed && onRetry && !selectionMode ? (
              retrying ? (
                <PemLoadingIndicator placement="bare" size="small" />
              ) : (
                <PemButton
                  size="sm"
                  variant="secondary"
                  onPress={() => {
                    setRetrying(true);
                    void onRetry(prep.id).finally(() => setRetrying(false));
                  }}
                >
                  Retry
                </PemButton>
              )
            ) : isPrepping && !failed ? (
              <ActivityIndicator size="small" color={accent.icon} />
            ) : null}
          </View>
        </View>

        {!selectionMode && onStarPress && !isPrepping ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={starred ? "Remove star" : "Star prep"}
            hitSlop={8}
            onPress={() => {
              onStarPress();
            }}
            style={({ pressed }) => [styles.starHit, { opacity: pressed ? 0.75 : 1 }]}
          >
            <Star
              size={22}
              color={starred ? s.amber : s.textTertiary}
              fill={starred ? s.amber : "transparent"}
              strokeWidth={2}
            />
          </Pressable>
        ) : null}

        {unread && !selectionMode ? (
          <View style={[styles.dot, { backgroundColor: s.amber }]} />
        ) : null}
      </Pressable>

      {!isLast ? (
        <View style={[styles.sep, { backgroundColor: s.border, marginLeft: sepMarginLeft }]} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: ROW_PAD_H,
    paddingVertical: 18,
    gap: space[4],
    minHeight: 82,
  },
  checkWell: {
    width: CHECK_COL,
    height: CHECK_COL,
    borderRadius: CHECK_COL / 2,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWell: {
    width: ICON_WELL,
    height: ICON_WELL,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  row1: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space[2],
  },
  title: {
    flex: 1,
    fontSize: fontSize.base,
    lineHeight: lh(fontSize.base, lineHeight.snug),
  },
  ts: {
    fontSize: fontSize.xs,
  },
  italicMeta: {
    fontSize: fontSize.xs,
  },
  teaserRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space[2],
  },
  teaser: {
    flex: 1,
    fontSize: fontSize.sm,
    lineHeight: lh(fontSize.sm, lineHeight.snug),
  },
  starHit: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    alignSelf: "center",
  },
  sep: {
    height: StyleSheet.hairlineWidth,
  },
});
