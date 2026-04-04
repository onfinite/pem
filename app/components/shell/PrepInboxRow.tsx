import type { Prep } from "@/components/sections/home-sections/homePrepData";
import PemButton from "@/components/ui/PemButton";
import PemLoadingIndicator from "@/components/ui/PemLoadingIndicator";
import PemText from "@/components/ui/PemText";
import { useInboxShell } from "@/constants/shellTokens";
import { fontFamily, fontSize, lh, lineHeight, space } from "@/constants/typography";
import { useTheme } from "@/contexts/ThemeContext";
import { formatRelativeHubTime } from "@/lib/formatRelativeHubTime";
import { prepListAccentFromIntent, prepListIconFromIntent } from "@/components/shell/prepTypeIcon";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";

type Mode = "ready" | "prepping" | "archived";

type Props = {
  prep: Prep;
  mode: Mode;
  isLast: boolean;
  onOpen: () => void;
  onRetry?: (id: string) => Promise<void>;
};

const ICON_WELL = 36;
const ROW_PAD_H = space[5];

/**
 * Gmail-style inbox row: hairline separator, bold when unread, amber strip when prepping.
 */
export default function PrepInboxRow({ prep, mode, isLast, onOpen, onRetry }: Props) {
  const s = useInboxShell();
  const { resolved } = useTheme();
  const accent = prepListAccentFromIntent(prep.intent ?? null, prep.kind, resolved);
  const isPrepping = mode === "prepping";
  const isArchived = mode === "archived";
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

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${prep.title}. ${prep.summary}`}
        onPress={onOpen}
        style={({ pressed }) => [
          styles.row,
          {
            backgroundColor: isPrepping ? s.rowPreppingBg : s.bg,
            opacity: isArchived ? 0.6 : pressed ? 0.92 : 1,
          },
        ]}
      >
        {isPrepping && !failed ? (
          <View style={[styles.strip, { backgroundColor: s.amber }]} />
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
                { color: unread ? s.textPrimary : s.textSecondary },
                unread && { fontFamily: fontFamily.sans.bold },
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
                  color: isPrepping && !failed ? s.amber : s.textSecondary,
                  fontFamily:
                    isPrepping && !failed ? fontFamily.sans.medium : fontFamily.sans.regular,
                },
              ]}
            >
              {teaser}
            </PemText>
            {isPrepping && failed && onRetry ? (
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

        {unread ? <View style={[styles.dot, { backgroundColor: s.amber }]} /> : null}
      </Pressable>

      {!isLast ? (
        <View
          style={[
            styles.sep,
            { backgroundColor: s.border, marginLeft: ROW_PAD_H + ICON_WELL + space[4] },
          ]}
        />
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
  strip: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 2,
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
