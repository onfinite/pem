import type { PrepIntent } from './prep-intent';

/**
 * Intents where device location can meaningfully improve results.
 * Aligned with `.cursor/rules/pem-location-permission.mdc` (maps to classifier intents we have today).
 */
const LOCATION_SENSITIVE: ReadonlySet<PrepIntent> = new Set([
  'FIND_PLACE',
  'EVENTS',
  'FLIGHTS',
  'BUSINESS',
  'JOBS',
]);

export function prepIntentNeedsLocation(intent: PrepIntent): boolean {
  return LOCATION_SENSITIVE.has(intent);
}

/** BullMQ delay so the client can POST ephemeral coords to Redis before the worker runs. */
export const LOCATION_PREP_QUEUE_DELAY_MS = 12_000;
