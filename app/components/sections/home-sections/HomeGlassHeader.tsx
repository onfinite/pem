import PemLogoRow from "@/components/brand/PemLogoRow";
import { useTheme } from "@/contexts/ThemeContext";
import { space } from "@/constants/typography";
import { BlurView } from "expo-blur";
import { router } from "expo-router";
import { Settings } from "lucide-react-native";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  TOP_BAR_ROW_PAD,
  TOP_ICON_CHIP,
  chipOnStrip,
  headerStripScrim,
} from "./homeLayout";

type Props = {
  blurTint: "light" | "dark";
  glassBorder: string;
};

export default function HomeGlassHeader({ blurTint, glassBorder }: Props) {
  const { colors, resolved } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.glassHeaderWrap} pointerEvents="box-none">
      <BlurView
        intensity={resolved === "dark" ? 38 : 50}
        tint={blurTint}
        style={[
          styles.headerBackdrop,
          {
            borderBottomColor: glassBorder,
          },
          Platform.OS === "ios" && { borderCurve: "continuous" },
        ]}
      >
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: headerStripScrim(resolved) }]}
        />
        <View
          style={{
            paddingTop: insets.top,
            paddingBottom: TOP_BAR_ROW_PAD,
            paddingHorizontal: space[3],
          }}
        >
          <View style={styles.topBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="New dump — type or speak"
              onPress={() => router.push("/dump")}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              style={({ pressed }) => [styles.topHit, styles.pemHit, { opacity: pressed ? 0.85 : 1 }]}
            >
              <View
                style={[
                  styles.topGlassChip,
                  {
                    backgroundColor: chipOnStrip(resolved),
                    borderColor: glassBorder,
                  },
                  Platform.select({
                    ios: {
                      shadowColor: resolved === "dark" ? "#000" : "#1c1a16",
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: resolved === "dark" ? 0.25 : 0.08,
                      shadowRadius: 8,
                    },
                    android: { elevation: 3 },
                  }),
                ]}
              >
                <View style={styles.iconSlot}>
                  <PemLogoRow size="mark" />
                </View>
              </View>
            </Pressable>
            <View style={styles.topSpacer} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Settings"
              onPress={() => router.push("/settings")}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              style={({ pressed }) => [styles.topHit, { opacity: pressed ? 0.85 : 1 }]}
            >
              <View
                style={[
                  styles.topGlassChip,
                  {
                    backgroundColor: chipOnStrip(resolved),
                    borderColor: glassBorder,
                  },
                  Platform.select({
                    ios: {
                      shadowColor: resolved === "dark" ? "#000" : "#1c1a16",
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: resolved === "dark" ? 0.25 : 0.08,
                      shadowRadius: 8,
                    },
                    android: { elevation: 3 },
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
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  glassHeaderWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 40,
  },
  headerBackdrop: {
    overflow: "hidden",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topGlassChip: {
    width: TOP_ICON_CHIP,
    height: TOP_ICON_CHIP,
    borderRadius: TOP_ICON_CHIP / 2,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: TOP_ICON_CHIP,
    paddingVertical: TOP_BAR_ROW_PAD,
  },
  topHit: {
    minWidth: 40,
    minHeight: 40,
    justifyContent: "center",
  },
  pemHit: {
    alignItems: "center",
    justifyContent: "center",
  },
  iconSlot: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  topSpacer: {
    flex: 1,
  },
});
