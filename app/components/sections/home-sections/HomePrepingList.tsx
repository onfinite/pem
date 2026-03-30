import PemText from "@/components/ui/PemText";
import { useTheme, type ThemeSemantic } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, lh, lineHeight, radii, space } from "@/constants/typography";
import { ActivityIndicator, Platform, StyleSheet, View } from "react-native";
import { PREPING_ROWS } from "./homePrepData";

function PrepingRow({
  row,
  colors,
  resolved,
}: {
  row: (typeof PREPING_ROWS)[number];
  colors: ThemeSemantic;
  resolved: "light" | "dark";
}) {
  return (
    <View
      style={[
        styles.prepingRow,
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
      <View style={[styles.prepingIconWell, { backgroundColor: colors.brandMutedSurface }]}>
        <row.Icon size={24} stroke={colors.pemAmber} strokeWidth={2.25} />
      </View>
      <View style={styles.prepingRowBody}>
        <PemText style={[styles.prepingRowSub, { color: colors.pemAmber }]}>{row.subtitle}</PemText>
        <PemText style={[styles.prepingRowTitle, { color: colors.textPrimary }]} numberOfLines={2}>
          {row.title}
        </PemText>
      </View>
      <View style={styles.prepingSpinner}>
        <ActivityIndicator size="small" color={colors.pemAmber} />
      </View>
    </View>
  );
}

export default function HomePrepingList() {
  const { colors, resolved } = useTheme();
  return (
    <View style={styles.prepingList}>
      {PREPING_ROWS.map((row) => (
        <PrepingRow key={row.id} row={row} colors={colors} resolved={resolved} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  prepingList: {
    gap: space[3],
  },
  prepingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingVertical: space[4],
    paddingHorizontal: space[4],
    borderRadius: radii.lg,
    borderWidth: 1,
  },
  prepingIconWell: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  prepingRowBody: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  prepingRowSub: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.xs,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  prepingRowTitle: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.md,
    lineHeight: lh(fontSize.md, lineHeight.snug),
  },
  prepingSpinner: {
    width: 28,
    alignItems: "center",
    justifyContent: "center",
  },
});
