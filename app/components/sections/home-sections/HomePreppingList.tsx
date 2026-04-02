import type { Prep } from "@/components/sections/home-sections/homePrepData";
import PemText from "@/components/ui/PemText";
import { usePrepHub } from "@/contexts/PrepHubContext";
import { useTheme, type ThemeSemantic } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, lh, lineHeight, radii, space } from "@/constants/typography";
import { ActivityIndicator, Platform, StyleSheet, View } from "react-native";
import { prepKindTagColor } from "./homePrepData";

function PreppingRow({
  prep,
  colors,
  resolved,
}: {
  prep: Prep;
  colors: ThemeSemantic;
  resolved: "light" | "dark";
}) {
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
        <ActivityIndicator size="small" color={colors.placeholder} />
      </View>
    </View>
  );
}

export default function HomePreppingList() {
  const { colors, resolved } = useTheme();
  const { preppingPreps } = usePrepHub();
  return (
    <View style={styles.preppingList}>
      {preppingPreps.map((prep) => (
        <PreppingRow key={prep.id} prep={prep} colors={colors} resolved={resolved} />
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
    width: 28,
    alignItems: "center",
    justifyContent: "center",
  },
});
