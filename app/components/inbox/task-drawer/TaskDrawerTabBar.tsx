import { pemAmber } from "@/constants/theme";
import {
  CalendarDays,
  Inbox,
  List,
  type LucideIcon,
} from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { taskDrawerViewStyles as styles } from "@/components/inbox/task-drawer/taskDrawerView.styles";
import type { Tab } from "@/components/inbox/task-drawer/useTaskDrawerController";

function calendarCountLabel(
  dayItemCount: number,
  selectedDate: string,
): string {
  if (dayItemCount === 0) return "";
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  if (selectedDate === todayKey) return `${dayItemCount} today`;

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
  if (selectedDate === tomorrowKey) return `${dayItemCount} tomorrow`;

  const d = new Date(selectedDate + "T12:00:00");
  const label = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${dayItemCount} on ${label}`;
}

export function TaskDrawerTabBar({
  tab,
  taskCount,
  dayItemCount,
  selectedDate,
  colors,
  onTabSwitch,
}: {
  tab: Tab;
  taskCount: number;
  dayItemCount: number;
  selectedDate: string;
  colors: { textPrimary: string; textTertiary: string; borderMuted: string };
  onTabSwitch: (t: Tab) => void;
}) {
  const tabDef: { key: Tab; label: string; icon: LucideIcon }[] = [
    { key: "calendar", label: "Calendar", icon: CalendarDays },
    { key: "inbox", label: "Inbox", icon: Inbox },
    { key: "lists", label: "Lists", icon: List },
  ];

  let countLabel = "";
  if (tab === "inbox") countLabel = `${taskCount} open`;
  else if (tab === "calendar") countLabel = calendarCountLabel(dayItemCount, selectedDate);

  return (
    <View
      style={[styles.tabRow, { borderBottomColor: colors.borderMuted }]}
    >
      {tabDef.map(({ key, label, icon: Icon }) => {
        const isActive = tab === key;
        return (
          <Pressable
            key={key}
            style={[
              styles.tabBtn,
              isActive && {
                borderBottomColor: pemAmber,
                borderBottomWidth: 2,
              },
            ]}
            onPress={() => onTabSwitch(key)}
          >
            <Icon
              size={15}
              color={isActive ? pemAmber : colors.textTertiary}
            />
            <Text
              style={[
                styles.tabLabel,
                {
                  color: isActive ? colors.textPrimary : colors.textTertiary,
                },
              ]}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}

      {countLabel ? (
        <>
          <View style={{ flex: 1 }} />
          <Text style={[styles.openCount, { color: colors.textTertiary }]}>
            {countLabel}
          </Text>
        </>
      ) : null}
    </View>
  );
}
