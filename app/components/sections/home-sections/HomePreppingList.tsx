import type { Prep } from "@/components/sections/home-sections/homePrepData";
import PemButton from "@/components/ui/PemButton";
import PemText from "@/components/ui/PemText";
import { usePrepHub } from "@/contexts/PrepHubContext";
import { useTheme, type ThemeSemantic } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, lh, lineHeight, radii, space } from "@/constants/typography";
import { useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, View } from "react-native";
import { prepKindTagColor } from "./homePrepData";

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
      <View style={[styles.preppingIconWell, { backgroundColor: colors.secondarySurface }]}>
        <Icon size={18} stroke={colors.textSecondary} strokeWidth={2} />
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
            <ActivityIndicator size="small" color={colors.pemAmber} />
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
          <ActivityIndicator size="small" color={colors.placeholder} />
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
    gap: space[3],
  },
  preppingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingVertical: space[4],
    paddingHorizontal: space[4],
    borderRadius: radii.lg,
    borderWidth: 1,
  },
  preppingIconWell: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
