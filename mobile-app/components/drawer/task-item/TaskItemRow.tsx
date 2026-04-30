import { space } from "@/constants/typography";
import { useTheme } from "@/contexts/ThemeContext";
import type { ApiExtract } from "@/services/api/pemApi";
import { isRecurringExtract } from "@/utils/guards/isRecurringExtract";
import { CalendarDays, ListTodo, Repeat } from "lucide-react-native";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";
import { CALENDAR_EVENT_DOT_COLOR } from "@/components/drawer/constants";
import { TaskItemMeta } from "@/components/drawer/task-item/TaskItemMeta";
import { itemStyles } from "@/components/drawer/task-item/taskItem.styles";
import { dismissOpenTaskSwipe } from "@/components/drawer/task-item/taskSwipeRegistry";

export const TaskItemRow = memo(function TaskItemRow({
  item,
  compact,
  onEditPress,
  borderColor,
  isOverdue,
  timeStr,
  dateStr,
  urgencyLabel,
  isCalendarBacked,
}: {
  item: ApiExtract;
  compact?: boolean;
  onEditPress: (item: ApiExtract) => void;
  borderColor: string;
  isOverdue: boolean;
  timeStr: string | null;
  dateStr: string | null;
  urgencyLabel: string | null;
  isCalendarBacked: boolean;
}) {
  const { colors } = useTheme();
  const isRecurring = isRecurringExtract(item);

  return (
    <View
      style={[
        itemStyles.row,
        { borderBottomColor: colors.borderMuted },
        compact && { paddingVertical: space[2] },
      ]}
    >
      <View
        style={itemStyles.checkboxHit}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {isCalendarBacked ? (
          <CalendarDays size={18} color={CALENDAR_EVENT_DOT_COLOR} />
        ) : isRecurring ? (
          <Repeat size={18} color={borderColor} strokeWidth={2.25} />
        ) : (
          <ListTodo size={18} color={borderColor} strokeWidth={2.25} />
        )}
      </View>

      <View style={itemStyles.rowMain}>
        <Pressable
          style={({ pressed }) => [
            itemStyles.content,
            pressed && { opacity: 0.72 },
          ]}
          onPress={() => {
            dismissOpenTaskSwipe();
            onEditPress(item);
          }}
          accessibilityRole="button"
          accessibilityLabel="Edit task"
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              style={[itemStyles.text, { color: colors.textPrimary }]}
              numberOfLines={2}
            >
              {item.text}
            </Text>
            <TaskItemMeta
              item={item}
              compact={compact}
              isOverdue={isOverdue}
              timeStr={timeStr}
              dateStr={dateStr}
              urgencyLabel={urgencyLabel}
            />
          </View>
        </Pressable>
      </View>
    </View>
  );
});
