import { pemAmber } from "@/constants/theme";
import { fontFamily, fontSize, space, radii } from "@/constants/typography";
import { useTheme } from "@/contexts/ThemeContext";
import type { TaskCounts } from "@/services/api/pemApi";
import { AlertTriangle, CheckCircle, Circle } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  counts: TaskCounts | null;
  onPress: () => void;
};

export default function TaskPill({ counts, onPress }: Props) {
  const { colors } = useTheme();

  if (!counts) return null;

  const { today, overdue, total_open } = counts;
  const hasOverdue = overdue > 0;
  const allClear = total_open === 0;

  let label: string;
  let icon: React.ReactNode;
  let pillBg: string;
  let textColor: string;

  if (allClear) {
    label = "All clear";
    icon = <CheckCircle size={14} color={colors.textTertiary} strokeWidth={2} />;
    pillBg = colors.secondarySurface;
    textColor = colors.textTertiary;
  } else if (hasOverdue) {
    label = `${overdue} overdue`;
    if (today > 0) label += ` · ${today} today`;
    icon = <AlertTriangle size={14} color="#e74c3c" strokeWidth={2} />;
    pillBg = "#e74c3c14";
    textColor = "#e74c3c";
  } else {
    label = `${today || total_open} ${today ? "today" : "open"}`;
    icon = <Circle size={14} color={pemAmber} strokeWidth={2} />;
    pillBg = `${pemAmber}14`;
    textColor = colors.textSecondary;
  }

  return (
    <Pressable
      onPress={onPress}
      style={[styles.pill, { backgroundColor: pillBg }]}
      hitSlop={8}
    >
      {icon}
      <Text style={[styles.label, { color: textColor }]}>Tasks · {label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: 6,
    paddingHorizontal: space[3],
    paddingVertical: 6,
    borderRadius: radii.xl,
  },
  label: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.xs,
  },
});
