import type { ApiExtract } from "@/lib/pemApi";

/**
 * Extracts that mirror Google Calendar should not be manually marked done in the UI;
 * completion is driven when the event time passes (server) or via reschedule in chat.
 */
export function isCalendarBackedExtract(item: ApiExtract): boolean {
  return (
    item.source === "calendar" ||
    (!!item.external_event_id && item.external_event_id.trim().length > 0)
  );
}
