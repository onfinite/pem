import { pemAmber } from "@/constants/theme";
import { fontFamily, fontSize, space, radii } from "@/constants/typography";
import { useTheme } from "@/contexts/ThemeContext";
import type { ApiExtract, CalendarViewResponse } from "@/lib/pemApi";
import { RefreshCw } from "lucide-react-native";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Calendar, type DateData } from "react-native-calendars";
import type { MarkedDatesMap } from "@/components/inbox/task-drawer/buildMarkedDates";
import { CALENDAR_EVENT_DOT_COLOR } from "@/components/inbox/task-drawer/constants";
import { DayDetail } from "@/components/inbox/task-drawer/DayDetail";
import { dismissOpenTaskSwipe } from "@/components/inbox/task-drawer/taskSwipeRegistry";
import { toDateKey } from "@/components/inbox/task-drawer/dateKeys";
import { taskDrawerViewStyles as styles } from "@/components/inbox/task-drawer/taskDrawerView.styles";

type CalendarTheme = Record<string, string | number | undefined>;

export function TaskDrawerCalendarPanel({
  calData,
  calLoading,
  calError,
  selectedDate,
  markedDates,
  dayItems,
  calendarTheme,
  onDayPress,
  onMonthChange,
  onCloseTask,
  onEditTask,
  onRetry,
  onRefresh,
  refreshing,
}: {
  calData: CalendarViewResponse | null;
  calLoading: boolean;
  calError: boolean;
  selectedDate: string;
  markedDates: MarkedDatesMap;
  dayItems: ApiExtract[];
  calendarTheme: CalendarTheme;
  onDayPress: (d: DateData) => void;
  onMonthChange: (m: DateData) => void;
  onCloseTask: (id: string) => void;
  onEditTask: (item: ApiExtract) => void;
  onRetry: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const { colors } = useTheme();

  if (calError && !calData) {
    return (
      <View style={styles.center}>
        <Text style={[local.errorText, { color: colors.textTertiary }]}>
          {`Couldn't load calendar`}
        </Text>
        <Pressable
          style={[local.retryBtn, { backgroundColor: colors.secondarySurface }]}
          onPress={onRetry}
        >
          <RefreshCw size={14} color={colors.textSecondary} />
          <Text style={[local.retryLabel, { color: colors.textSecondary }]}>
            Try again
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: space[4] }}
      showsVerticalScrollIndicator={false}
      onScrollBeginDrag={dismissOpenTaskSwipe}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={pemAmber}
        />
      }
    >
      <Calendar
        markingType="multi-dot"
        markedDates={markedDates}
        onDayPress={onDayPress}
        onMonthChange={onMonthChange}
        theme={calendarTheme}
        enableSwipeMonths
        style={styles.calendar}
      />

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: pemAmber }]} />
          <Text style={[styles.legendText, { color: colors.textTertiary }]}>
            Task
          </Text>
        </View>
        <View style={styles.legendItem}>
          <View
            style={[styles.legendDot, { backgroundColor: CALENDAR_EVENT_DOT_COLOR }]}
          />
          <Text style={[styles.legendText, { color: colors.textTertiary }]}>
            Calendar
          </Text>
        </View>
      </View>

      {calLoading && !calData ? (
        <View style={styles.center}>
          <ActivityIndicator color={pemAmber} />
        </View>
      ) : (
        <DayDetail
          dateKey={selectedDate}
          items={dayItems}
          overdueItems={
            selectedDate === toDateKey(new Date())
              ? (calData?.overdue ?? [])
              : []
          }
          onCloseTask={onCloseTask}
          onEditTask={onEditTask}
        />
      )}
    </ScrollView>
  );
}

const local = StyleSheet.create({
  errorText: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.sm,
    marginBottom: space[3],
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: space[4],
    paddingVertical: space[2],
    borderRadius: radii.md,
  },
  retryLabel: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.sm,
  },
});
