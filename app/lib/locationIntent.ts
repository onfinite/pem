/**
 * Intents that may use device location (see `.cursor/rules/pem-location-permission.mdc`).
 * Matches backend `prepIntentNeedsLocation` for the intents we classify today.
 */
const LOCATION_SENSITIVE_INTENTS = new Set(["FIND_PLACE"]);

export function isLocationSensitiveIntent(intent: string | null | undefined): boolean {
  if (!intent) return false;
  return LOCATION_SENSITIVE_INTENTS.has(intent);
}
