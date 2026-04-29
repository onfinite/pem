import { useTheme } from "@/contexts/ThemeContext";
import { Repeat } from "lucide-react-native";
import { Text, View } from "react-native";
import { itemStyles } from "@/components/inbox/task-drawer/taskItem.styles";

export function TaskRecurrenceChip({ label }: { label: string }) {
  const { colors } = useTheme();

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`Recurring, ${label}`}
      style={[
        itemStyles.recurrenceChip,
        {
          backgroundColor: colors.brandMutedSurface,
          borderColor: colors.pemAmber,
        },
      ]}
    >
      <Repeat
        size={10}
        color={colors.pemAmber}
        importantForAccessibility="no"
      />
      <Text
        importantForAccessibility="no"
        style={[itemStyles.chipText, { color: colors.pemAmber }]}
      >
        {label}
      </Text>
    </View>
  );
}
