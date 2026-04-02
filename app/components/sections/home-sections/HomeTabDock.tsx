import PemText from "@/components/ui/PemText";
import { useTheme } from "@/contexts/ThemeContext";
import { amber } from "@/constants/theme";
import { fontFamily, fontSize, lh, lineHeight, radii, space } from "@/constants/typography";
import { router } from "expo-router";
import { Mic } from "lucide-react-native";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TAB_DOCK_INNER_MIN, segmentTrackTint } from "./homeLayout";
import { TABS, type PrepTab } from "./homePrepData";

type Props = {
  tab: PrepTab;
  onTab: (t: PrepTab) => void;
  glassBorder: string;
};

export default function HomeTabDock({ tab, onTab, glassBorder }: Props) {
  const { colors, resolved } = useTheme();
  const insets = useSafeAreaInsets();
  const trackTint = segmentTrackTint(resolved);

  return (
    <View style={styles.tabDockShell} pointerEvents="box-none">
      <View
        style={[
          styles.tabDockBlur,
          {
            backgroundColor: colors.pageBackground,
            borderTopColor: glassBorder,
            overflow: "hidden",
          },
          Platform.OS === "ios" && { borderCurve: "continuous" },
        ]}
      >
        <View
          style={[
            styles.tabDockRow,
            {
              paddingBottom: insets.bottom,
              paddingTop: space[2],
              paddingHorizontal: space[3],
            },
          ]}
        >
          {/* Segmented hub tabs — one clear “active” pill inside the track */}
          <View style={[styles.segmentTrack, { backgroundColor: trackTint }]}>
            {TABS.map((t) => {
              const active = tab === t.id;
              const TabIcon = t.Icon;
              const inactiveColor = colors.textSecondary;
              const activeColor = colors.pemAmber;
              return (
                <Pressable
                  key={t.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${t.label} tab`}
                  onPress={() => onTab(t.id)}
                  style={({ pressed }) => [
                    styles.segmentTab,
                    active && styles.segmentTabActive,
                    active && {
                      backgroundColor:
                        resolved === "light" ? colors.secondarySurface : colors.cardBackground,
                      borderColor:
                        resolved === "dark"
                          ? "rgba(255, 255, 255, 0.1)"
                          : "rgba(28, 26, 22, 0.1)",
                    },
                    active &&
                      Platform.select({
                        ios: {
                          shadowColor: "#000",
                          shadowOffset: { width: 0, height: 1 },
                          shadowOpacity: resolved === "dark" ? 0.35 : 0.08,
                          shadowRadius: 3,
                        },
                        android: { elevation: 2 },
                      }),
                    pressed && !active && { opacity: 0.9 },
                  ]}
                >
                  <TabIcon
                    size={20}
                    color={active ? activeColor : inactiveColor}
                    strokeWidth={active ? 2.35 : 2}
                  />
                  <PemText
                    numberOfLines={1}
                    style={[
                      styles.tabLabel,
                      {
                        marginTop: 3,
                        color: active ? activeColor : inactiveColor,
                        fontFamily: active ? fontFamily.sans.semibold : fontFamily.sans.medium,
                        opacity: active ? 1 : 0.92,
                      },
                    ]}
                  >
                    {t.label}
                  </PemText>
                </Pressable>
              );
            })}
          </View>

          {/* Separator + primary capture (Dump) — distinct from hub tabs */}
          <View
            style={[
              styles.divider,
              { backgroundColor: colors.borderMuted },
            ]}
          />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dump — text"
            onPress={() => router.push("/dump")}
            style={({ pressed }) => [styles.dumpColumn, pressed && { opacity: 0.94 }]}
          >
            {({ pressed }) => (
              <View style={styles.dumpInner}>
                <View
                  style={[
                    styles.dumpCircle,
                    {
                      backgroundColor: pressed ? amber[600] : colors.pemAmber,
                      borderColor: "rgba(255,255,255,0.28)",
                      ...Platform.select({
                        ios: {
                          shadowColor: colors.pemAmber,
                          shadowOffset: { width: 0, height: 2 },
                          shadowOpacity: 0.35,
                          shadowRadius: 8,
                        },
                        android: { elevation: 4 },
                      }),
                    },
                  ]}
                >
                  <Mic size={20} color={colors.onPrimary} strokeWidth={2.25} />
                </View>
                <PemText
                  numberOfLines={1}
                  style={[
                    styles.dumpLabel,
                    {
                      marginTop: 3,
                      color: colors.pemAmber,
                    },
                  ]}
                >
                  Dump
                </PemText>
              </View>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabDockShell: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
  },
  tabDockBlur: {
    width: "100%",
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tabDockRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    minHeight: TAB_DOCK_INNER_MIN,
    gap: space[2],
  },
  segmentTrack: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "stretch",
    borderRadius: radii.md,
    padding: 3,
    gap: 2,
  },
  segmentTab: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: space[2],
    paddingHorizontal: space[1],
    borderRadius: radii.sm + 2,
  },
  segmentTabActive: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  tabLabel: {
    fontSize: fontSize.xs,
    lineHeight: lh(fontSize.xs, lineHeight.snug),
    letterSpacing: 0.15,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 36,
    alignSelf: "center",
    opacity: 0.9,
  },
  dumpColumn: {
    width: 56,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 0,
  },
  dumpInner: {
    alignItems: "center",
    justifyContent: "center",
  },
  dumpCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  dumpLabel: {
    fontSize: fontSize.xs,
    lineHeight: lh(fontSize.xs, lineHeight.snug),
    fontFamily: fontFamily.sans.semibold,
    letterSpacing: 0.2,
  },
});
