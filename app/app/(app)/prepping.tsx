import PreppingDumpFlow from "@/components/sections/prepping-sections/PreppingDumpFlow";
import PemButton from "@/components/ui/PemButton";
import { PREPPING_FLOW_MAX_WIDTH } from "@/constants/layout";
import { useTheme } from "@/contexts/ThemeContext";
import { space } from "@/constants/typography";
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** After a dump: scrollable body + pinned “View in Preps” so long lists stay usable. */
export default function PreppingScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const goHome = () => {
    router.replace("/home");
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.pageBackground }]}>
      <PreppingDumpFlow />

      <View
        style={[
          styles.footer,
          {
            borderTopColor: colors.borderMuted,
            backgroundColor: colors.pageBackground,
            paddingBottom: Math.max(insets.bottom, space[3]),
          },
        ]}
      >
        <View style={styles.footerInner}>
          <PemButton variant="primary" size="lg" onPress={goHome} style={styles.footerBtn}>
            View in Preps
          </PemButton>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: space[4],
    alignItems: "center",
    width: "100%",
  },
  footerInner: {
    width: "100%",
    maxWidth: PREPPING_FLOW_MAX_WIDTH,
    paddingHorizontal: space[5],
  },
  footerBtn: {
    width: "100%",
  },
});
