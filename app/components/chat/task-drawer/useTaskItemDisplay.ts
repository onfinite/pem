import type { ApiExtract } from "@/lib/pemApi";
import { useMemo } from "react";
import { isCalendarBackedExtract } from "./calendarExtract";

export function useTaskItemDisplay(item: ApiExtract) {
  const displayAnchor =
    item.event_start_at ??
    item.scheduled_at ??
    item.due_at ??
    item.period_start;

  const isCalendarBacked = isCalendarBackedExtract(item);

  const isOverdue = useMemo(() => {
    if (isCalendarBacked) return false;
    if (item.period_end) return new Date(item.period_end) < new Date();
    if (displayAnchor) return new Date(displayAnchor) < new Date();
    return false;
  }, [isCalendarBacked, displayAnchor, item.period_end]);
  const noManualComplete = isCalendarBacked;

  const timeStr = useMemo(() => {
    if (!displayAnchor) return null;
    const d = new Date(displayAnchor);
    if (
      item.period_end &&
      d.getHours() === 0 &&
      d.getMinutes() === 0
    ) {
      return null;
    }
    return d.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  }, [displayAnchor, item.period_end]);

  const dateStr = useMemo(() => {
    if (!displayAnchor) return null;
    const d = new Date(displayAnchor);
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    if (sameDay) return null;
    return d.toLocaleDateString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }, [displayAnchor]);

  const urgencyLabel = useMemo(() => {
    if (item.urgency === "someday" && !displayAnchor) return "Someday";
    return null;
  }, [item.urgency, displayAnchor]);

  return {
    displayAnchor,
    isOverdue,
    isCalendarBacked,
    noManualComplete,
    timeStr,
    dateStr,
    urgencyLabel,
  };
}
