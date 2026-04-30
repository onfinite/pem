import { useTheme } from "@/contexts/ThemeContext";
import type { ApiExtract } from "@/services/api/pemApi";
import { openNativeMapsForPlace } from "@/services/links/placeLinks";
import { formatExtractRecurrence } from "@/utils/formatting/formatExtractRecurrence";
import { Clock, ExternalLink, MapPin } from "lucide-react-native";
import { useCallback, useMemo } from "react";
import { Pressable, View, Text } from "react-native";
import { itemStyles } from "@/components/drawer/task-item/taskItem.styles";
import { TaskRecurrenceChip } from "@/components/drawer/task-item/TaskRecurrenceChip";

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatBatchKey(key: string): string {
  if (key === "follow_ups") return "Follow-ups";
  return capitalize(key);
}

export function TaskItemMeta({
  item,
  compact,
  isOverdue,
  timeStr,
  dateStr,
  urgencyLabel,
}: {
  item: ApiExtract;
  compact?: boolean;
  isOverdue: boolean;
  timeStr: string | null;
  dateStr: string | null;
  urgencyLabel: string | null;
}) {
  const { colors } = useTheme();

  const periodLine = useMemo(() => {
    if (!item.period_start || !item.period_end) return null;
    const a = new Date(item.period_start);
    const b = new Date(item.period_end);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
    const fmt = (d: Date) =>
      d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });

    const isSameDay =
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();

    return isSameDay ? fmt(a) : `${fmt(a)} → ${fmt(b)}`;
  }, [item.period_start, item.period_end]);

  const periodLabel = useMemo(() => {
    if (!item.period_start) return item.period_label ?? null;
    const start = new Date(item.period_start);
    const now = new Date();
    const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const todayDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffDays = Math.round((startDay.getTime() - todayDay.getTime()) / 86_400_000);
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Tomorrow";
    // Do not trust server period_label for relative words if the anchor day disagrees
    // (e.g. period_label "today" with period_start on Monday).
    const raw = item.period_label?.trim();
    if (raw) {
      const key = raw.toLowerCase();
      const isMisleadingRelative =
        (key === "today" && diffDays !== 0) ||
        (key === "tomorrow" && diffDays !== 1) ||
        ((key === "tonight" || key === "now") && diffDays !== 0);
      if (isMisleadingRelative) return null;
      return capitalize(raw);
    }
    return null;
  }, [item.period_start, item.period_label]);

  const durationLine =
    item.duration_minutes != null && item.duration_minutes > 0
      ? `${item.duration_minutes} min`
      : null;

  const handleLocationPress = useCallback(() => {
    if (!item.event_location) return;
    void openNativeMapsForPlace({
      name: item.event_location,
      address: item.event_location,
      lat: 0,
      lng: 0,
    });
  }, [item.event_location]);

  const recurrenceLabel = useMemo(() => {
    if (item.recurrence_rule) return formatExtractRecurrence(item.recurrence_rule);
    if (item.recurrence_parent_id) return "Recurring";
    return null;
  }, [item.recurrence_rule, item.recurrence_parent_id]);

  const hasPeriod = !!periodLine;

  return (
    <View style={itemStyles.meta}>
      {recurrenceLabel && <TaskRecurrenceChip label={recurrenceLabel} />}
      {isOverdue && (
        <Text style={[itemStyles.metaText, { color: "#e74c3c" }]}>Overdue</Text>
      )}
      {!isOverdue && !hasPeriod && timeStr && (
        <View style={itemStyles.metaRow}>
          <Clock size={11} color={colors.textTertiary} />
          <Text style={[itemStyles.metaText, { color: colors.textTertiary }]}>
            {timeStr}
          </Text>
        </View>
      )}
      {!isOverdue && !hasPeriod && dateStr && (
        <Text style={[itemStyles.metaText, { color: colors.textTertiary }]}>
          {dateStr}
        </Text>
      )}
      {urgencyLabel && !hasPeriod && (
        <Text style={[itemStyles.metaText, { color: colors.textTertiary }]}>
          {urgencyLabel}
        </Text>
      )}
      {hasPeriod && (
        <Text style={[itemStyles.metaText, { color: colors.textTertiary }]}>
          {periodLabel ? `${periodLabel} · ` : ""}
          {periodLine}
        </Text>
      )}
      {durationLine && (
        <Text style={[itemStyles.metaText, { color: colors.textTertiary }]}>
          {durationLine}
          {item.is_deadline ? " · Deadline" : ""}
        </Text>
      )}
      {item.event_location && (
        <Pressable
          onPress={handleLocationPress}
          style={({ pressed }) => [
            itemStyles.metaRow,
            pressed && { opacity: 0.7 },
          ]}
          accessibilityRole="link"
          accessibilityLabel={`Open ${item.event_location} in Maps`}
        >
          <MapPin size={11} color={colors.textTertiary} />
          <Text
            style={[itemStyles.metaText, { color: colors.textTertiary }]}
            numberOfLines={1}
          >
            {item.event_location}
          </Text>
          <ExternalLink size={9} color={colors.textTertiary} />
        </Pressable>
      )}
      {!compact && item.batch_key && (
        <View
          style={[itemStyles.chip, { backgroundColor: colors.secondarySurface }]}
        >
          <Text style={[itemStyles.chipText, { color: colors.textSecondary }]}>
            {formatBatchKey(item.batch_key!)}
          </Text>
        </View>
      )}
    </View>
  );
}
