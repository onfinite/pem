import type { ApiExtract } from "@/lib/pemApi";

/**
 * True when the extract originated from or is linked to a Google Calendar event.
 * Used for visual differentiation (calendar icon in meta row) — NOT for
 * blocking completion or dismissal.
 */
export function isCalendarBackedExtract(item: ApiExtract): boolean {
  return (
    item.source === "calendar" ||
    (!!item.external_event_id && item.external_event_id.trim().length > 0)
  );
}
