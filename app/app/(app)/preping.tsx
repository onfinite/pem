import AppHomeHeader from "@/components/layout/AppHomeHeader";
import PrepingDumpFlow from "@/components/sections/preping-sections/PrepingDumpFlow";
import { useTheme } from "@/contexts/ThemeContext";
import { space } from "@/constants/typography";
import { router } from "expo-router";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** After a dump: acknowledgement, in-flight preps, reassurance — one screen. */
export default function PrepingScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const goHome = () => {
    router.replace("/home");
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: colors.pageBackground }]}>
      <View style={styles.headerPad}>
        <AppHomeHeader
          variant="minimal"
          onBackPress={goHome}
          onSettingsPress={() => router.push("/settings")}
        />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: Math.max(insets.bottom, space[8]) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <PrepingDumpFlow onBackToPreps={goHome} />
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
    paddingTop: space[2],
  },
});
