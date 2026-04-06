import { useTheme } from "@/contexts/ThemeContext";
import { space } from "@/constants/typography";
import { router } from "expo-router";
import { X } from "lucide-react-native";
import { Keyboard, Pressable, StyleSheet, View } from "react-native";

export default function DumpCloseBar() {
  const { colors, resolved } = useTheme();
  const ctrlSurface = resolved === "dark" ? colors.secondarySurface : colors.cardBackground;

  return (
    <View style={styles.safeTop}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={() => {
          Keyboard.dismiss();
          router.push("/inbox");
        }}
        hitSlop={12}
        style={({ pressed }) => [
          styles.closeBtn,
          {
            backgroundColor: ctrlSurface,
            borderColor: colors.borderMuted,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        <X size={22} color={colors.textPrimary} strokeWidth={2.25} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safeTop: {
    paddingHorizontal: space[4],
    paddingBottom: space[2],
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
