import { space } from "@/constants/typography";
import { useTheme } from "@/contexts/ThemeContext";
import type { ApiExtract } from "@/lib/pemApi";
import { useMemo } from "react";
import { Text, View } from "react-native";
import { toDateKey } from "@/components/chat/task-drawer/dateKeys";
import { dayStyles } from "@/components/chat/task-drawer/dayDetail.styles";
import { TaskItem } from "@/components/chat/task-drawer/TaskItem";

export function DayDetail({
  dateKey,
  items,
  overdueItems,
  onCloseTask,
  onEditTask,
}: {
  dateKey: string;
  items: ApiExtract[];
  overdueItems: ApiExtract[];
  onCloseTask: (id: string) => void;
  onEditTask: (item: ApiExtract) => void;
}) {
  const { colors } = useTheme();
  const isToday = dateKey === toDateKey(new Date());

  const label = useMemo(() => {
    const d = new Date(dateKey + "T12:00:00");
    if (isToday) return "Today";
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (dateKey === toDateKey(tomorrow)) return "Tomorrow";
    return d.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  }, [dateKey, isToday]);

  const sorted = useMemo(() => {
    const timed: ApiExtract[] = [];
    const untimed: ApiExtract[] = [];
    for (const item of items) {
      const a = item.event_start_at ?? item.due_at;
      if (a) timed.push(item);
      else untimed.push(item);
    }
    timed.sort((a, b) => {
      const aT = new Date(a.event_start_at ?? a.due_at ?? 0).getTime();
      const bT = new Date(b.event_start_at ?? b.due_at ?? 0).getTime();
      return aT - bT;
    });
    return [...timed, ...untimed];
  }, [items]);

  const showOverdue = isToday && overdueItems.length > 0;

  return (
    <View style={{ flex: 1 }}>
      <Text
        style={[
          dayStyles.dateLabel,
          { color: colors.textPrimary, paddingHorizontal: space[4] },
        ]}
      >
        {label}
      </Text>

      {showOverdue && (
        <>
          <Text
            style={[
              dayStyles.sectionLabel,
              { color: "#e74c3c", paddingHorizontal: space[4] },
            ]}
          >
            OVERDUE
          </Text>
          {overdueItems.map((item) => (
            <TaskItem
              key={item.id}
              item={item}
              onCloseTask={onCloseTask}
              onEditPress={onEditTask}
            />
          ))}
        </>
      )}

      {sorted.length === 0 && !showOverdue && (
        <Text
          style={[
            dayStyles.empty,
            { color: colors.textTertiary, paddingHorizontal: space[4] },
          ]}
        >
          Nothing scheduled
        </Text>
      )}

      {sorted.map((item) => (
        <TaskItem
          key={item.id}
          item={item}
          onCloseTask={onCloseTask}
          onEditPress={onEditTask}
        />
      ))}
    </View>
  );
}
