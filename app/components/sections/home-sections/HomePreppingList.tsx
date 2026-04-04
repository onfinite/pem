import type { Prep } from "@/components/sections/home-sections/homePrepData";
import PemButton from "@/components/ui/PemButton";
import PemLoadingIndicator from "@/components/ui/PemLoadingIndicator";
import PemText from "@/components/ui/PemText";
import { usePrepHub } from "@/contexts/PrepHubContext";
import { useTheme, type ThemeSemantic } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, lh, lineHeight, radii, space } from "@/constants/typography";
import { useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, View } from "react-native";
import { prepKindTagColor } from "./homePrepData";
import { prepListAccentFromIntent } from "@/components/shell/prepTypeIcon";

export function PreppingRow({
  prep,
  colors,
  resolved,
  onRetry,
}: {
  prep: Prep;
  colors: ThemeSemantic;
  resolved: "light" | "dark";
  onRetry: (id: string) => Promise<void>;
}) {
  const [retrying, setRetrying] = useState(false);
  const failed = prep.status === "failed";
  const subColor = prepKindTagColor(prep.kind, resolved);
  const accent = prepListAccentFromIntent(prep.intent ?? null, prep.kind, resolved);
  const Icon = prep.Icon;
  return (
    <View
      style={[
        styles.preppingRow,
        {
          backgroundColor: colors.cardBackground,
          borderColor: colors.borderMuted,
          ...Platform.select({
            ios: {
              shadowColor: resolved === "dark" ? "#000" : "#1c1a16",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: resolved === "dark" ? 0.2 : 0.06,
              shadowRadius: 8,
            },
            android: { elevation: 2 },
          }),
        },
      ]}
    >
      <View style={[styles.preppingIconWell, { backgroundColor: accent.well }]}>
        <Icon size={20} stroke={accent.icon} strokeWidth={2.1} />
      </View>
      <View style={styles.preppingRowBody}>
        <PemText style={[styles.preppingRowSub, { color: subColor }]}>{prep.tag}</PemText>
        <PemText style={[styles.preppingRowTitle, { color: colors.textPrimary }]} numberOfLines={2}>
          {prep.title}
        </PemText>
      </View>
      <View style={styles.preppingSpinner}>
        {failed ? (
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
        ) : (
          <ActivityIndicator size="small" color={accent.icon} />
        )}
      </View>
    </View>
  );
}

type Props = {
  /** When set (e.g. post-dump flow), show only these rows instead of all hub in-flight preps. */
  preps?: Prep[];
};

export default function HomePreppingList({ preps: prepsOverride }: Props) {
  const { colors, resolved } = useTheme();
  const { preppingPreps, retryPrep } = usePrepHub();
  const list = prepsOverride ?? preppingPreps;
  return (
    <View style={styles.preppingList}>
      {list.map((prep) => (
        <PreppingRow
          key={prep.id}
          prep={prep}
          colors={colors}
          resolved={resolved}
          onRetry={retryPrep}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  preppingList: {
    gap: space[4],
  },
  preppingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[4],
    paddingVertical: space[5],
    paddingHorizontal: space[5],
    borderRadius: radii.lg,
    borderWidth: 1,
  },
  preppingIconWell: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  preppingRowBody: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  preppingRowSub: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.xs,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  preppingRowTitle: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.md,
    lineHeight: lh(fontSize.md, lineHeight.snug),
  },
  preppingSpinner: {
    minWidth: 72,
    alignItems: "center",
    justifyContent: "center",
  },
});
