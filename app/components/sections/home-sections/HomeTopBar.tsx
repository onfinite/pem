import PemText from "@/components/ui/PemText";
import { useTheme } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, lh, lineHeight, space } from "@/constants/typography";
import { router } from "expo-router";
import { Settings } from "lucide-react-native";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TOP_BAR_ROW_PAD, TOP_ICON_CHIP } from "./homeLayout";

type Props = {
  title: string;
  glassBorder: string;
};

/** Fixed top row: page title (left) + settings (right). */
export default function HomeTopBar({ title, glassBorder }: Props) {
  const { colors, resolved } = useTheme();
  const insets = useSafeAreaInsets();
  const chipFill = colors.secondarySurface;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View
        style={[
          styles.backdrop,
          {
            backgroundColor: colors.pageBackground,
            borderBottomColor: glassBorder,
          },
          Platform.OS === "ios" && { borderCurve: "continuous" },
        ]}
      >
        <View
          style={{
            paddingTop: insets.top,
            paddingBottom: TOP_BAR_ROW_PAD,
            paddingHorizontal: space[3],
          }}
        >
          <View style={styles.row}>
            <PemText
              accessibilityRole="header"
              numberOfLines={1}
              style={[styles.title, { color: colors.textPrimary }]}
            >
              {title}
            </PemText>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Settings"
              onPress={() => router.push("/settings")}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              style={({ pressed }) => [styles.hit, { opacity: pressed ? 0.85 : 1 }]}
            >
              <View
                style={[
                  styles.chip,
                  {
                    backgroundColor: chipFill,
                    borderColor: glassBorder,
                  },
                  Platform.select({
                    ios: {
                      shadowColor: "#000",
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: resolved === "dark" ? 0.2 : 0.06,
                      shadowRadius: 4,
                    },
                    android: { elevation: resolved === "dark" ? 2 : 2 },
                  }),
                ]}
              >
                <View style={styles.iconSlot}>
                  <Settings size={20} stroke={colors.textSecondary} strokeWidth={2} />
                </View>
              </View>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 40,
  },
  backdrop: {
    overflow: "hidden",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space[3],
    minHeight: TOP_ICON_CHIP,
    paddingVertical: TOP_BAR_ROW_PAD,
  },
  title: {
    flex: 1,
    minWidth: 0,
    fontFamily: fontFamily.display.semibold,
    fontSize: fontSize.xl,
    lineHeight: lh(fontSize.xl, lineHeight.snug),
    letterSpacing: -0.3,
    textAlign: "left",
  },
  chip: {
    width: TOP_ICON_CHIP,
    height: TOP_ICON_CHIP,
    borderRadius: TOP_ICON_CHIP / 2,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  hit: {
    minWidth: 40,
    minHeight: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  iconSlot: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
});
