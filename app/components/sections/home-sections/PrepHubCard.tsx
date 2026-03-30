import PemButton from "@/components/ui/PemButton";
import PemText from "@/components/ui/PemText";
import { useTheme } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, lh, lineHeight, radii, space } from "@/constants/typography";
import { Archive, type LucideIcon } from "lucide-react-native";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import type { Prep } from "./homePrepData";

function IconWell({
  Icon,
  colors,
}: {
  Icon: LucideIcon;
  colors: { pemAmber: string; brandMutedSurface: string };
}) {
  return (
    <View style={[styles.iconWell, { backgroundColor: colors.brandMutedSurface }]}>
      <Icon size={24} stroke={colors.pemAmber} strokeWidth={2.25} />
    </View>
  );
}

type Props = {
  prep: Prep;
  resolved: "light" | "dark";
  /** Opens full prep detail (card tap + View use the same). */
  onOpenDetail: () => void;
  /** When set, shows archive control. */
  onArchive?: () => void;
  archivedVisual?: boolean;
};

export default function PrepHubCard({
  prep,
  resolved,
  onOpenDetail,
  onArchive,
  archivedVisual = false,
}: Props) {
  const { colors } = useTheme();
  const tagColor = archivedVisual ? colors.textSecondary : colors.pemAmber;

  const cardChrome = [
    styles.card,
    {
      backgroundColor: colors.cardBackground,
      borderColor: colors.borderMuted,
      opacity: archivedVisual ? 0.92 : 1,
      ...Platform.select({
        ios: {
          shadowColor: resolved === "dark" ? "#000" : "#1c1a16",
          shadowOffset: { width: 0, height: archivedVisual ? 2 : 4 },
          shadowOpacity: archivedVisual
            ? resolved === "dark"
              ? 0.15
              : 0.04
            : resolved === "dark"
              ? 0.25
              : 0.06,
          shadowRadius: archivedVisual ? 8 : 12,
        },
        android: { elevation: archivedVisual ? 1 : 2 },
      }),
    },
  ];

  return (
    <View style={cardChrome}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${prep.title}. ${prep.summary}`}
        onPress={onOpenDetail}
        style={({ pressed }) => [styles.cardTap, pressed && { opacity: 0.96 }]}
      >
        <View style={styles.cardHead}>
          <IconWell Icon={prep.Icon} colors={colors} />
          <View style={styles.cardHeadText}>
            <PemText style={[styles.cardTag, { color: tagColor }]}>{prep.tag}</PemText>
            <PemText style={[styles.cardTitle, { color: colors.textPrimary }]} numberOfLines={2}>
              {prep.title}
            </PemText>
            <PemText style={[styles.summary, { color: colors.textSecondary }]} numberOfLines={3}>
              {prep.summary}
            </PemText>
          </View>
        </View>
      </Pressable>

      <View style={[styles.actions, { borderTopColor: colors.borderMuted }]}>
        <PemButton variant="secondary" size="sm" onPress={onOpenDetail} style={styles.viewBtn}>
          {prep.viewLabel}
        </PemButton>
        {onArchive ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Archive ${prep.title}`}
            onPress={onArchive}
            hitSlop={8}
            style={({ pressed }) => [
              styles.archiveHit,
              { borderColor: colors.borderMuted, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Archive size={20} stroke={colors.textSecondary} strokeWidth={2} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.lg,
    borderWidth: 1,
    overflow: "hidden",
  },
  cardTap: {
    borderRadius: radii.lg,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space[3],
    padding: space[4],
  },
  iconWell: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  cardHeadText: {
    flex: 1,
    minWidth: 0,
    gap: space[1],
  },
  cardTag: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.xs,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  cardTitle: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.lg,
    lineHeight: lh(fontSize.lg, lineHeight.snug),
  },
  summary: {
    fontSize: fontSize.sm,
    lineHeight: lh(fontSize.sm, lineHeight.relaxed),
    fontFamily: fontFamily.sans.regular,
    marginTop: space[1],
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  viewBtn: {
    flex: 1,
    minWidth: 0,
  },
  archiveHit: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
