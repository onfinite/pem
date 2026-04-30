import { useTheme } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, space } from "@/constants/typography";
import type { ReactNode } from "react";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";

type Props = {
  title?: string;
  body?: string;
  subtitle?: string;
  style?: ViewStyle;
  children?: ReactNode;
};

export default function HubEmptyState({ title, body, subtitle, style, children }: Props) {
  const { colors } = useTheme();
  const desc = body ?? subtitle;
  return (
    <View style={[styles.container, style]}>
      {title && (
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          {title}
        </Text>
      )}
      {desc && (
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {desc}
        </Text>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: space[8],
    paddingVertical: space[12],
  },
  title: {
    fontFamily: fontFamily.display.semibold,
    fontSize: fontSize.lg,
    marginBottom: space[2],
    textAlign: "center",
  },
  subtitle: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.base,
    textAlign: "center",
  },
});
