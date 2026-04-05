import type { PrepTab } from "@/components/sections/home-sections/homePrepData";
import { TABS } from "@/components/sections/home-sections/homePrepData";
import HubUnreadBadge from "@/components/shell/HubUnreadBadge";
import { useInboxShell } from "@/constants/shellTokens";
import { fontFamily, fontSize, lh, lineHeight, space } from "@/constants/typography";
import { useTheme } from "@/contexts/ThemeContext";
import { pemImpactLight } from "@/lib/pemHaptics";
import PemText from "@/components/ui/PemText";
import { Pressable, Modal, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const DRAWER_W = 288;

type Props = {
  visible: boolean;
  active: PrepTab;
  onClose: () => void;
  onSelectTab: (t: PrepTab) => void;
  /** Inbox preps not yet opened — badge on Inbox. */
  unreadReadyCount: number;
};

/**
 * Left navigation drawer (Gmail-style) — replaces bottom hub tabs.
 */
export default function InboxHubDrawer({
  visible,
  active,
  onClose,
  onSelectTab,
  unreadReadyCount,
}: Props) {
  const s = useInboxShell();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root} accessibilityViewIsModal>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close menu"
          style={styles.scrim}
          onPress={() => {
            pemImpactLight();
            onClose();
          }}
        />
        <View
          style={[
            styles.panel,
            {
              width: DRAWER_W,
              paddingTop: insets.top + space[3],
              paddingBottom: insets.bottom + space[4],
              backgroundColor: s.bgElevated,
              borderRightColor: s.border,
            },
          ]}
        >
          <PemText style={[styles.title, { color: s.textPrimary }]}>Preps</PemText>
          <View style={{ height: space[4] }} />
          {TABS.map(({ id, label, Icon }) => {
            const selected = active === id;
            const showReadyBadge = id === "ready" && unreadReadyCount > 0;
            return (
              <Pressable
                key={id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={
                  showReadyBadge
                    ? `${label}, ${unreadReadyCount} unread`
                    : label
                }
                onPress={() => {
                  pemImpactLight();
                  onSelectTab(id);
                  onClose();
                }}
                style={({ pressed }) => [
                  styles.item,
                  {
                    backgroundColor: selected ? s.bg : "transparent",
                    opacity: pressed ? 0.88 : 1,
                  },
                ]}
              >
                <View style={styles.itemIcon}>
                  <Icon
                    size={22}
                    color={selected ? colors.pemAmber : s.textSecondary}
                    strokeWidth={2.1}
                  />
                </View>
                <PemText
                  numberOfLines={1}
                  style={[
                    styles.itemLabel,
                    {
                      color: selected ? s.textPrimary : s.textSecondary,
                      fontFamily: selected ? fontFamily.sans.semibold : fontFamily.sans.medium,
                    },
                  ]}
                >
                  {label}
                </PemText>
                {showReadyBadge ? <HubUnreadBadge count={unreadReadyCount} /> : null}
              </Pressable>
            );
          })}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  panel: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontFamily: fontFamily.sans.bold,
    fontSize: fontSize.lg,
    lineHeight: lh(fontSize.lg, lineHeight.snug),
    paddingHorizontal: space[4],
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: space[2],
    paddingVertical: 12,
    paddingHorizontal: space[3],
    borderRadius: 10,
    minHeight: 48,
  },
  itemIcon: {
    width: 28,
    alignItems: "center",
  },
  itemLabel: {
    flex: 1,
    fontSize: fontSize.base,
    lineHeight: lh(fontSize.base, lineHeight.snug),
  },
});
