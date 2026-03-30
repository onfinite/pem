import AppHomeHeader from "@/components/layout/AppHomeHeader";
import PrepingIntro from "@/components/sections/preping-sections/PrepingIntro";
import PrepingLeaveHint from "@/components/sections/preping-sections/PrepingLeaveHint";
import PrepingParallelRows from "@/components/sections/preping-sections/PrepingParallelRows";
import { useTheme } from "@/contexts/ThemeContext";
import { space } from "@/constants/typography";
import { router } from "expo-router";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Parallel prep work in flight after a dump — Continue → received acknowledgement. */
export default function PrepingScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: colors.pageBackground }]}>
      <View style={styles.headerPad}>
        <AppHomeHeader
          variant="minimal"
          onBackPress={() => router.replace("/home")}
          onSettingsPress={() => router.push("/settings")}
        />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: Math.max(insets.bottom, space[8]) }]}
        showsVerticalScrollIndicator={false}
      >
        <PrepingIntro />
        <PrepingParallelRows />
        <PrepingLeaveHint onContinue={() => router.replace("/received")} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  headerPad: {
    paddingHorizontal: space[4],
  },
  scroll: {
    paddingHorizontal: space[5],
    gap: space[5],
  },
});
