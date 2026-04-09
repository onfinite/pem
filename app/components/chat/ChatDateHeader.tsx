import { useTheme } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, space } from "@/constants/typography";
import { StyleSheet, Text, View } from "react-native";

type Props = { date: string };

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const msgDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (msgDate.getTime() === today.getTime()) return "Today";
  if (msgDate.getTime() === yesterday.getTime()) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

export default function ChatDateHeader({ date }: Props) {
  const { colors } = useTheme();
  return (
    <View style={styles.container}>
      <View style={[styles.pill, { backgroundColor: colors.surfacePage }]}>
        <Text style={[styles.text, { color: colors.textTertiary }]}>
          {formatDateLabel(date)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    marginVertical: space[3],
  },
  pill: {
    paddingHorizontal: space[3],
    paddingVertical: space[1],
    borderRadius: 999,
  },
  text: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.xs,
  },
});
