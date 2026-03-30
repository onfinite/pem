import PemText from "@/components/ui/PemText";
import ReceivedScrollBody from "@/components/sections/received-sections/ReceivedScrollBody";
import { useTheme } from "@/contexts/ThemeContext";
import { space } from "@/constants/typography";
import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Short acknowledgement after preping — user can leave; preps land on home. */
export default function ReceivedScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const onClose = () => {
    router.replace("/home");
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: colors.pageBackground }]}>
      <View style={[styles.topRow, { paddingHorizontal: space[4] }]}>
        <View style={styles.topSpacer} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close and return to preps"
          onPress={onClose}
          hitSlop={12}
          style={styles.closeTextBtn}
        >
          <PemText variant="label" style={{ color: colors.pemAmber }}>
            Close
          </PemText>
        </Pressable>
      </View>

      <ReceivedScrollBody onBackToPreps={onClose} bottomInset={insets.bottom} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: space[2],
  },
  topSpacer: {
    flex: 1,
  },
  closeTextBtn: {
    paddingVertical: space[2],
    paddingHorizontal: space[2],
  },
});
