import PemText from "@/components/ui/PemText";
import { useTheme } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, lh, lineHeight, radii, space } from "@/constants/typography";
import { Dumbbell, Gift, Search, type LucideIcon } from "lucide-react-native";
import { ActivityIndicator, Platform, StyleSheet, View } from "react-native";

type Row = { id: string; title: string; subtitle: string; Icon: LucideIcon };

const ROWS: Row[] = [
  { id: "1", Icon: Gift, title: "Gift ideas for mom", subtitle: "Finding options" },
  { id: "2", Icon: Dumbbell, title: "Gym cancellation", subtitle: "Researching policy" },
  { id: "3", Icon: Search, title: "Your app idea", subtitle: "Deep research" },
];

export default function PrepingParallelRows() {
  const { colors, resolved } = useTheme();
  return (
    <View style={styles.list}>
      {ROWS.map((row) => (
        <View
          key={row.id}
          style={[
            styles.row,
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
          <View style={[styles.iconWell, { backgroundColor: colors.brandMutedSurface }]}>
            <row.Icon size={24} stroke={colors.pemAmber} strokeWidth={2.25} />
          </View>
          <View style={styles.rowBody}>
            <PemText style={[styles.rowSub, { color: colors.pemAmber }]}>{row.subtitle}</PemText>
            <PemText style={[styles.rowTitle, { color: colors.textPrimary }]} numberOfLines={2}>
              {row.title}
            </PemText>
          </View>
          <View style={styles.rowStatus}>
            <ActivityIndicator size="small" color={colors.pemAmber} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: space[3],
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingVertical: space[4],
    paddingHorizontal: space[4],
    borderRadius: radii.lg,
    borderWidth: 1,
  },
  iconWell: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  rowSub: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.xs,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  rowTitle: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.md,
    lineHeight: lh(fontSize.md, lineHeight.snug),
  },
  rowStatus: {
    width: 28,
    alignItems: "center",
    justifyContent: "center",
  },
});
