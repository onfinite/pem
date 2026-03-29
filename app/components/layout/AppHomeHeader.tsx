import PemText from "@/components/PemText";
import { textSecondary } from "@/constants/theme";
import { fontFamily, fontSize, space } from "@/constants/typography";
import { Pressable, StyleSheet, View } from "react-native";

type AppHomeHeaderProps = {
  title?: string;
  onSettingsPress?: () => void;
};

export default function AppHomeHeader({
  title = "Home",
  onSettingsPress,
}: AppHomeHeaderProps) {
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
        <PemText style={styles.gear}>⚙</PemText>
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
  title: {
    flex: 1,
  },
  iconBtn: {
    padding: space[2],
  },
  gear: {
    fontSize: fontSize.xl,
    fontFamily: fontFamily.sans.regular,
    color: textSecondary,
  },
});
