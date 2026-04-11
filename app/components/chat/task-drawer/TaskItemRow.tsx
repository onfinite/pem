import { space } from "@/constants/typography";
import { useTheme } from "@/contexts/ThemeContext";
import type { ApiExtract } from "@/lib/pemApi";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";
import { TaskItemMeta } from "./TaskItemMeta";
import { itemStyles } from "./taskItem.styles";

export const TaskItemRow = memo(function TaskItemRow({
  item,
  compact,
  onDone,
  onEditPress,
  borderColor,
  noManualComplete,
  isOverdue,
  timeStr,
  dateStr,
  urgencyLabel,
  isCalendarBacked,
}: {
  item: ApiExtract;
  compact?: boolean;
  onDone: (id: string) => void;
  onEditPress: (item: ApiExtract) => void;
  borderColor: string;
  noManualComplete: boolean;
  isOverdue: boolean;
  timeStr: string | null;
  dateStr: string | null;
  urgencyLabel: string | null;
  isCalendarBacked: boolean;
}) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        itemStyles.row,
        { borderBottomColor: colors.borderMuted },
        compact && { paddingVertical: space[2] },
      ]}
    >
      <Pressable
        onPress={() => onDone(item.id)}
        disabled={noManualComplete}
        hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
        style={({ pressed }) => [
          itemStyles.checkboxHit,
          pressed && !noManualComplete && { opacity: 0.65 },
        ]}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: false, disabled: noManualComplete }}
        accessibilityLabel={
          noManualComplete
            ? "Done unavailable for calendar events"
            : "Mark done"
        }
      >
        <View
          style={[
            itemStyles.checkboxOuter,
            {
              borderColor,
              opacity: noManualComplete ? 0.45 : 1,
            },
          ]}
        />
      </Pressable>

      <View style={itemStyles.rowMain}>
        <Pressable
          style={({ pressed }) => [
            itemStyles.content,
            pressed && { opacity: 0.72 },
          ]}
          onPress={() => onEditPress(item)}
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
              isCalendarBacked={isCalendarBacked}
              noManualComplete={noManualComplete}
            />
          </View>
        </Pressable>
      </View>
    </View>
  );
});
