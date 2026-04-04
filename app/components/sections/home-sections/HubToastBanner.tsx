import PemText from "@/components/ui/PemText";
import { INBOX_TAB_BAR_FIXED_HEIGHT } from "@/components/sections/home-sections/homeLayout";
import { usePrepHub } from "@/contexts/PrepHubContext";
import { useTheme } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, lh, lineHeight, space } from "@/constants/typography";
import { pemSelection } from "@/lib/pemHaptics";
import { useSegments } from "expo-router";
import { X } from "lucide-react-native";
import { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const AUTO_DISMISS_MS = 3200;
const AUTO_DISMISS_WITH_UNDO_MS = 5200;

/**
 * Global prep hub snack — overlays any screen inside `PrepHubProvider` (home, prep detail, etc.).
 * Sits above the inbox tab bar on home; uses safe-area bottom elsewhere.
 */
export default function HubToastBanner() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const reserveForInboxTabBar = segments.includes("home");
  const { hubToast, dismissHubToast } = usePrepHub();

  useEffect(() => {
    if (!hubToast) return;
    const ms = hubToast.undo ? AUTO_DISMISS_WITH_UNDO_MS : AUTO_DISMISS_MS;
    const t = setTimeout(() => dismissHubToast(), ms);
    return () => clearTimeout(t);
  }, [hubToast, dismissHubToast]);

  if (!hubToast) {
    return null;
  }

  const bottomPad =
    insets.bottom +
    (reserveForInboxTabBar ? INBOX_TAB_BAR_FIXED_HEIGHT + space[2] : space[3]);

  return (
    <View style={[styles.wrap, { bottom: bottomPad }]} pointerEvents="box-none">
      <View
        style={[
          styles.banner,
          {
            backgroundColor: colors.brandMutedSurface,
            borderColor: colors.borderMuted,
          },
        ]}
      >
        <PemText style={[styles.text, { color: colors.textPrimary }]}>{hubToast.message}</PemText>
        {hubToast.undo ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Undo"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            onPress={() => {
              pemSelection();
              const u = hubToast.undo;
              dismissHubToast();
              if (u) void u();
            }}
            style={({ pressed }) => [styles.undoBtn, { opacity: pressed ? 0.75 : 1 }]}
          >
            <PemText style={[styles.undoLabel, { color: colors.pemAmber }]}>Undo</PemText>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss message"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={() => {
            pemSelection();
            dismissHubToast();
          }}
          style={({ pressed }) => [styles.close, { opacity: pressed ? 0.7 : 1 }]}
        >
          <X size={18} stroke={colors.textSecondary} strokeWidth={2} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: space[4],
    right: space[4],
    zIndex: 9999,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: space[2],
    paddingLeft: space[4],
    paddingRight: space[2],
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  undoBtn: {
    paddingVertical: space[2],
    paddingHorizontal: space[2],
    justifyContent: "center",
  },
  undoLabel: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.sm,
    lineHeight: lh(fontSize.sm, lineHeight.snug),
  },
  close: {
    padding: space[2],
    justifyContent: "center",
    alignItems: "center",
  },
});
