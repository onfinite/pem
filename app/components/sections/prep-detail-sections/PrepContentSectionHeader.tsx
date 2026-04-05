import PemText from "@/components/ui/PemText";
import { useTheme } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, lh, lineHeight, space } from "@/constants/typography";
import { StyleSheet, View } from "react-native";

type Props = {
  title: string;
  subtitle?: string;
};

/**
 * Labels the main block below the prep title — options, brief, research, etc.
 */
export default function PrepContentSectionHeader({ title, subtitle }: Props) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap} accessibilityRole="header">
      <PemText style={[styles.title, { color: colors.textSecondary }]}>{title}</PemText>
      {subtitle?.trim() ? (
        <PemText style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle.trim()}</PemText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: space[1],
  },
  title: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.xs,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  subtitle: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.sm,
    lineHeight: lh(fontSize.sm, lineHeight.relaxed),
  },
});
