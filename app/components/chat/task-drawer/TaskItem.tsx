import { pemAmber } from "@/constants/theme";
import { useTheme } from "@/contexts/ThemeContext";
import type { ApiExtract } from "@/lib/pemApi";
import { memo } from "react";
import { CALENDAR_EVENT_DOT_COLOR } from "./constants";
import { TaskItemRow } from "./TaskItemRow";
import { useTaskItemDisplay } from "./useTaskItemDisplay";

export const TaskItem = memo(function TaskItem({
  item,
  onDone,
  compact,
  onEditPress,
}: {
  item: ApiExtract;
  onDone: (id: string) => void;
  compact?: boolean;
  onEditPress: (item: ApiExtract) => void;
}) {
  const { colors } = useTheme();
  const meta = useTaskItemDisplay(item);

  const borderColor = meta.noManualComplete
    ? colors.textTertiary
    : meta.isCalendarBacked
      ? CALENDAR_EVENT_DOT_COLOR
      : pemAmber;

  return (
    <TaskItemRow
      item={item}
      compact={compact}
      onDone={onDone}
      onEditPress={onEditPress}
      borderColor={borderColor}
      noManualComplete={meta.noManualComplete}
      isOverdue={meta.isOverdue}
      timeStr={meta.timeStr}
      dateStr={meta.dateStr}
      urgencyLabel={meta.urgencyLabel}
      isCalendarBacked={meta.isCalendarBacked}
    />
  );
});
