import PrepingDumpFlow from "@/components/sections/preping-sections/PrepingDumpFlow";
import { useTheme } from "@/contexts/ThemeContext";
import { space } from "@/constants/typography";
import { router } from "expo-router";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** After a dump: acknowledgement, in-flight preps, reassurance — no chrome; user leaves via “Back to Preps”. */
export default function PrepingScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const goHome = () => {
    router.replace("/home");
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.pageBackground }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: insets.top + space[4],
            paddingBottom: Math.max(insets.bottom, space[8]),
          },
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
  scroll: {
    paddingHorizontal: space[5],
  },
});
