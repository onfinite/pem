import { useTheme } from "@/contexts/ThemeContext";
import { pemAmber } from "@/constants/theme";
import { fontFamily, space } from "@/constants/typography";
import { StyleSheet, Text, View } from "react-native";

type PemLogoRowProps = {
  /** Larger logo for welcome; compact for auth headers; hero for signed-in home; mark = icon only (circle + P) */
  size?: "default" | "large" | "hero" | "mark";
};

export default function PemLogoRow({ size = "default" }: PemLogoRowProps) {
  const { colors } = useTheme();
  const circle =
    size === "hero" ? 80 : size === "large" ? 56 : size === "mark" ? 24 : 44;
  const pSize =
    size === "hero" ? 40 : size === "large" ? 28 : size === "mark" ? 11 : 22;
  const wordSize = size === "hero" ? 38 : size === "large" ? 32 : 26;

  const mark = (
    <View style={[styles.circle, { width: circle, height: circle, borderRadius: circle / 2 }]}>
      <Text style={[styles.pLetter, { fontSize: pSize, lineHeight: pSize + 4 }]}>P</Text>
    </View>
  );

  if (size === "mark") {
    return mark;
  }

  return (
    <View style={styles.row} accessibilityRole="header">
      {mark}
      <Text
        style={[
          styles.wordmark,
          { fontSize: wordSize, lineHeight: wordSize * 1.05, color: colors.textPrimary },
        ]}
      >
        pem
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
  },
  circle: {
    backgroundColor: pemAmber,
    alignItems: "center",
    justifyContent: "center",
  },
  pLetter: {
    fontFamily: fontFamily.display.bold,
    color: "#ffffff",
  },
  wordmark: {
    fontFamily: fontFamily.display.semibold,
    letterSpacing: -0.8,
    fontWeight: "300",
  },
});
