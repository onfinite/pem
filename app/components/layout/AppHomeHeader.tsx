import PemText from "@/components/ui/PemText";
import { useTheme } from "@/contexts/ThemeContext";
import { space } from "@/constants/typography";
import { Settings } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";

type AppHomeHeaderProps = {
  title?: string;
  /** Settings-only row, right-aligned (e.g. main capture screen) */
  variant?: "default" | "minimal";
  onSettingsPress?: () => void;
};

export default function AppHomeHeader({
  title = "Home",
  variant = "default",
  onSettingsPress,
}: AppHomeHeaderProps) {
  const { colors } = useTheme();

  if (variant === "minimal") {
    return (
      <View style={styles.minimalRow}>
        <View style={styles.minimalSpacer} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Settings"
          onPress={onSettingsPress}
          hitSlop={12}
          style={styles.iconBtn}
        >
          <Settings size={22} stroke={colors.textSecondary} strokeWidth={2} />
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <PemText variant="titleLarge" style={styles.title}>
        {title}
      </PemText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Settings"
        onPress={onSettingsPress}
        hitSlop={12}
        style={styles.iconBtn}
      >
        <Settings size={22} stroke={colors.textSecondary} strokeWidth={2} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space[6],
  },
  minimalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginBottom: space[4],
  },
  minimalSpacer: {
    flex: 1,
  },
  title: {
    flex: 1,
  },
  iconBtn: {
    padding: space[2],
  },
});
