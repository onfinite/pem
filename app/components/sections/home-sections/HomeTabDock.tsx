import PemText from "@/components/ui/PemText";
import { useTheme } from "@/contexts/ThemeContext";
import { amber } from "@/constants/theme";
import { fontFamily, fontSize, radii, space } from "@/constants/typography";
import { BlurView } from "expo-blur";
import { router } from "expo-router";
import { Mic } from "lucide-react-native";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TAB_DOCK_INNER_MIN } from "./homeLayout";
import { TABS, type PrepTab } from "./homePrepData";

type Props = {
  tab: PrepTab;
  onTab: (t: PrepTab) => void;
  blurTint: "light" | "dark";
  glassBorder: string;
};

export default function HomeTabDock({ tab, onTab, blurTint, glassBorder }: Props) {
  const { colors, resolved } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.tabDockShell} pointerEvents="box-none">
      <BlurView
        intensity={resolved === "dark" ? 38 : 48}
        tint={blurTint}
        style={[
          styles.tabDockBlur,
          {
            borderTopColor: glassBorder,
            backgroundColor: colors.cardBackground,
            overflow: "hidden",
          },
          Platform.OS === "ios" && { borderCurve: "continuous" },
          Platform.select({
            ios: {
              shadowColor: resolved === "dark" ? "#000" : "#1c1a16",
              shadowOffset: { width: 0, height: -2 },
              shadowOpacity: resolved === "dark" ? 0.22 : 0.1,
              shadowRadius: 0,
            },
            android: {
              elevation: 12,
            },
          }),
        ]}
      >
        <View
          style={[
            styles.tabDockRow,
            {
              paddingBottom: insets.bottom,
              paddingTop: space[2],
              paddingHorizontal: space[2],
            },
          ]}
        >
          {TABS.map((t) => {
            const active = tab === t.id;
            const tint = active ? colors.pemAmber : colors.textSecondary;
            const TabIcon = t.Icon;
            return (
              <Pressable
                key={t.id}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${t.label} tab`}
                onPress={() => onTab(t.id)}
                style={({ pressed }) => [
                  styles.tabDockItem,
                  active && {
                    backgroundColor:
                      resolved === "dark"
                        ? "rgba(232, 118, 58, 0.2)"
                        : "rgba(232, 118, 58, 0.14)",
                  },
                  pressed && { opacity: 0.9 },
                ]}
              >
                <TabIcon size={23} color={tint} strokeWidth={active ? 2.5 : 2} />
                <PemText
                  variant="caption"
                  numberOfLines={1}
                  style={{
                    marginTop: 3,
                    color: tint,
                    fontSize: fontSize.xs,
                    letterSpacing: active ? 0.2 : 0,
                    fontFamily: active ? fontFamily.sans.semibold : fontFamily.sans.medium,
                  }}
                >
                  {t.label}
                </PemText>
              </Pressable>
            );
          })}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="New dump — record by voice or text"
            onPress={() => router.push("/dump")}
            style={({ pressed }) => [styles.tabDockRecordSlot, pressed && { opacity: 0.96 }]}
          >
            {({ pressed }) => (
              <View style={styles.tabDockRecordInner}>
                <View
                  style={[
                    styles.tabDockRecordCircle,
                    {
                      backgroundColor: pressed ? amber[600] : colors.pemAmber,
                      borderColor: "rgba(255,255,255,0.22)",
                      ...Platform.select({
                        ios: {
                          shadowColor: colors.pemAmber,
                          shadowOffset: { width: 0, height: 3 },
                          shadowOpacity: 0.4,
                          shadowRadius: 10,
                        },
                        android: { elevation: 5 },
                      }),
                    },
                  ]}
                >
                  <Mic size={23} color={colors.onPrimary} strokeWidth={2.35} />
                </View>
                <PemText
                  variant="caption"
                  numberOfLines={1}
                  style={{
                    marginTop: 3,
                    color: colors.pemAmber,
                    fontSize: fontSize.xs,
                    fontFamily: fontFamily.sans.semibold,
                    letterSpacing: 0.2,
                  }}
                >
                  Record
                </PemText>
              </View>
            )}
          </Pressable>
        </View>
      </BlurView>
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
    alignItems: "stretch",
    minHeight: TAB_DOCK_INNER_MIN,
    gap: space[1],
  },
  tabDockItem: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: space[2],
    paddingHorizontal: space[1],
    borderRadius: radii.lg,
  },
  tabDockRecordSlot: {
    flex: 1,
    minWidth: 0,
    paddingVertical: space[2],
    paddingHorizontal: space[1],
    alignItems: "center",
    justifyContent: "center",
  },
  tabDockRecordInner: {
    alignItems: "center",
    justifyContent: "center",
  },
  tabDockRecordCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
});
