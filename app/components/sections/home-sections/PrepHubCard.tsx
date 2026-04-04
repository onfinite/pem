import PemMarkdown from "@/components/ui/PemMarkdown";
import PemText from "@/components/ui/PemText";
import { useTheme } from "@/contexts/ThemeContext";
import { pemImpactLight } from "@/lib/pemHaptics";
import { fontFamily, fontSize, lh, lineHeight, radii, space } from "@/constants/typography";
import { ChevronRight, type LucideIcon } from "lucide-react-native";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { prepKindTagColor, type Prep } from "./homePrepData";

function IconWell({
  Icon,
  iconColor,
  surfaceColor,
}: {
  Icon: LucideIcon;
  iconColor: string;
  surfaceColor: string;
}) {
  return (
    <View style={[styles.iconWell, { backgroundColor: surfaceColor }]}>
      <Icon size={18} stroke={iconColor} strokeWidth={2} />
    </View>
  );
}

type Props = {
  prep: Prep;
  resolved: "light" | "dark";
  onOpenDetail: () => void;
  archivedVisual?: boolean;
  /** Warm inbox line, e.g. time · Pem prepared… — hub ready cards only. */
  inboxMeta?: string | null;
};

/** Full card is tappable — chevron only; no separate CTA strip. */
export default function PrepHubCard({
  prep,
  resolved,
  onOpenDetail,
  archivedVisual = false,
  inboxMeta,
}: Props) {
  const { colors } = useTheme();
  const tagColor = archivedVisual
    ? colors.textSecondary
    : prepKindTagColor(prep.kind, resolved);
  const inbox = Boolean(inboxMeta);
  const showUnreadStripe = inbox && prep.unread;

  const cardChrome = [
    styles.card,
    {
      backgroundColor: colors.cardBackground,
      borderWidth: 1,
      borderColor: colors.borderMuted,
      borderLeftWidth: showUnreadStripe ? 3 : 1,
      borderLeftColor: showUnreadStripe ? colors.pemAmber : colors.borderMuted,
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
        android: { elevation: archivedVisual ? 1 : inbox ? 3 : 2 },
      }),
    },
  ];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${prep.title}. ${prep.summary}. Open`}
      onPress={() => {
        pemImpactLight();
        onOpenDetail();
      }}
      style={({ pressed }) => [...cardChrome, pressed && { opacity: 0.94 }]}
    >
      <View style={styles.cardRow}>
        {!inbox ? (
          prep.unread ? (
            <View
              style={[styles.unreadDot, { backgroundColor: colors.pemAmber }]}
              accessibilityLabel="Unread"
            />
          ) : (
            <View style={styles.unreadSpacer} />
          )
        ) : (
          <View style={styles.unreadSpacer} />
        )}
        <IconWell
          Icon={prep.Icon}
          iconColor={colors.textSecondary}
          surfaceColor={colors.secondarySurface}
        />
        <View style={styles.cardHeadText}>
          {inboxMeta ? (
            <PemText
              variant="caption"
              numberOfLines={1}
              style={[styles.inboxMeta, { color: colors.textSecondary }]}
            >
              {inboxMeta}
            </PemText>
          ) : null}
          <PemText style={[styles.cardTag, { color: tagColor }]}>{prep.tag}</PemText>
          <PemText style={[styles.cardTitle, { color: colors.textPrimary }]} numberOfLines={2}>
            {prep.title}
          </PemText>
          <View style={styles.summaryClamp}>
            <PemMarkdown variant="card">{prep.summary}</PemMarkdown>
          </View>
        </View>
        <ChevronRight
          size={20}
          stroke={colors.textSecondary}
          strokeWidth={2}
          style={styles.chevron}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.xl,
    borderWidth: 1,
    overflow: "hidden",
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingVertical: space[4],
    paddingLeft: space[3],
    paddingRight: space[3],
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
    alignSelf: "center",
  },
  unreadSpacer: {
    width: 8,
    flexShrink: 0,
  },
  iconWell: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  cardHeadText: {
    flex: 1,
    minWidth: 0,
    gap: space[1],
  },
  inboxMeta: {
    fontFamily: fontFamily.sans.regular,
    letterSpacing: 0.2,
    marginBottom: space[1],
  },
  chevron: {
    opacity: 0.65,
    flexShrink: 0,
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
  summaryClamp: {
    marginTop: space[1],
    maxHeight: 78,
    overflow: "hidden",
  },
});
