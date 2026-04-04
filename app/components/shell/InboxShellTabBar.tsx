import PemText from "@/components/ui/PemText";
import type { PrepTab } from "@/components/sections/home-sections/homePrepData";
import {
  INBOX_TAB_BAR_FIXED_HEIGHT,
  segmentTrackTint,
} from "@/components/sections/home-sections/homeLayout";
import { useTheme } from "@/contexts/ThemeContext";
import { useInboxShell } from "@/constants/shellTokens";
import { fontFamily, lh, lineHeight, radii, space } from "@/constants/typography";
import { pemImpactLight, pemSelection } from "@/lib/pemHaptics";
import { Archive, CheckCircle2, Loader2, type LucideIcon } from "lucide-react-native";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const INBOX_TABS: { id: PrepTab; label: string; Icon: LucideIcon }[] = [
  { id: "ready", label: "Preps", Icon: CheckCircle2 },
  { id: "prepping", label: "Prepping", Icon: Loader2 },
  { id: "archived", label: "Archived", Icon: Archive },
];

const ICON_SIZE = 17;
const LABEL_SIZE = 10;

type Props = {
  active: PrepTab;
  onChange: (t: PrepTab) => void;
  hasUnreadReady: boolean;
};

/**
 * Bottom segmented hub tabs — compact; sits above home indicator (insets).
 */
export default function InboxShellTabBar({ active, onChange, hasUnreadReady }: Props) {
  const { colors, resolved } = useTheme();
  const s = useInboxShell();
  const trackTint = segmentTrackTint(resolved);
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.dock,
        {
          backgroundColor: s.bg,
          borderTopColor: s.border,
          paddingBottom: insets.bottom + space[2],
          height: INBOX_TAB_BAR_FIXED_HEIGHT + insets.bottom,
        },
      ]}
    >
      <View style={[styles.segmentTrack, { backgroundColor: trackTint }]}>
        {INBOX_TABS.map((t) => {
          const isActive = active === t.id;
          const TabIcon = t.Icon;
          const inactiveColor = colors.textSecondary;
          const activeColor = colors.pemAmber;
          return (
            <Pressable
              key={t.id}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={`${t.label} tab`}
              onPress={() => {
                pemImpactLight();
                if (t.id === active) return;
                pemSelection();
                onChange(t.id);
              }}
              style={({ pressed }) => [
                styles.segmentTab,
                isActive && styles.segmentTabActive,
                isActive && {
                  backgroundColor:
                    resolved === "light" ? colors.secondarySurface : colors.cardBackground,
                  borderColor:
                    resolved === "dark"
                      ? "rgba(255, 255, 255, 0.1)"
                      : "rgba(28, 26, 22, 0.1)",
                },
                isActive &&
                  Platform.select({
                    ios: {
                      shadowColor: "#000",
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: resolved === "dark" ? 0.3 : 0.06,
                      shadowRadius: 2,
                    },
                    android: { elevation: 2 },
                  }),
                pressed && !isActive && { opacity: 0.9 },
              ]}
            >
              <TabIcon
                size={ICON_SIZE}
                color={isActive ? activeColor : inactiveColor}
                strokeWidth={isActive ? 2.25 : 2}
              />
              <View style={styles.labelRow}>
                <PemText
                  numberOfLines={1}
                  style={[
                    styles.tabLabel,
                    {
                      marginTop: 4,
                      color: isActive ? activeColor : inactiveColor,
                      fontFamily: isActive ? fontFamily.sans.semibold : fontFamily.sans.medium,
                      opacity: isActive ? 1 : 0.9,
                    },
                  ]}
                >
                  {t.label}
                </PemText>
                {t.id === "ready" && hasUnreadReady ? (
                  <View style={[styles.unreadDot, { backgroundColor: s.amber }]} />
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 25,
    paddingHorizontal: space[4],
    paddingTop: space[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
  },
  segmentTrack: {
    flexDirection: "row",
    alignItems: "stretch",
    borderRadius: radii.md,
    paddingHorizontal: space[2],
    paddingVertical: space[2],
    gap: space[2],
  },
  segmentTab: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: space[2],
    paddingHorizontal: space[2],
    borderRadius: radii.sm,
  },
  segmentTabActive: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  unreadDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginTop: 2,
  },
  tabLabel: {
    fontSize: LABEL_SIZE,
    lineHeight: lh(LABEL_SIZE, lineHeight.snug),
    letterSpacing: 0.12,
  },
});
