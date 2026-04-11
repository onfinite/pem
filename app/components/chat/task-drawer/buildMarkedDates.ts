import { pemAmber } from "@/constants/theme";
import type { CalendarViewResponse } from "@/lib/pemApi";
import { CALENDAR_EVENT_DOT_COLOR } from "./constants";

export type MarkedDatesMap = Record<
  string,
  {
    dots: { key: string; color: string }[];
    selected?: boolean;
  }
>;

export function buildMarkedDates(
  calData: CalendarViewResponse | null,
  selectedDate: string,
): MarkedDatesMap {
  if (!calData) return {};
  const marks: MarkedDatesMap = {};
  for (const [dateKey, counts] of Object.entries(calData.dot_map)) {
    const dots: { key: string; color: string }[] = [];
    if (counts.tasks > 0) dots.push({ key: "task", color: pemAmber });
    if (counts.events > 0)
      dots.push({ key: "event", color: CALENDAR_EVENT_DOT_COLOR });
    marks[dateKey] = {
      dots,
      ...(dateKey === selectedDate ? { selected: true } : {}),
    };
  }
  if (!marks[selectedDate]) {
    marks[selectedDate] = { selected: true, dots: [] };
  } else {
    marks[selectedDate] = { ...marks[selectedDate], selected: true };
  }
  return marks;
}
