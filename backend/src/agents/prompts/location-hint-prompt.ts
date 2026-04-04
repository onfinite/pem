import type { ClientLocationHint } from '../../events/prep-events.service';
import { prepIntentNeedsLocation } from '../intents/location-intent';
import type { PrepIntent } from '../intents/prep-intent';

/**
 * Injects ephemeral location guidance into the prep user prompt (never persisted).
 */
export function formatLocationHintForPrompt(
  hint: ClientLocationHint | null,
  intent: PrepIntent,
): string {
  if (!hint) {
    return '';
  }
  if (hint.kind === 'coords') {
    return `Session-only approximate device location for this prep (do not persist coordinates; avoid echoing raw lat/lng in the card unless the user asks): latitude ${hint.latitude.toFixed(4)}, longitude ${hint.longitude.toFixed(4)}.

**Maps search is centered on this point on the server** — your google(vertical: maps) calls still use a normal place query (e.g. "highly rated restaurants") and do not need to encode lat/lng in the query string.`;
  }
  if (hint.kind === 'unavailable' && prepIntentNeedsLocation(intent)) {
    return `The user did not share device location (or chose not to). This is not an error.

**Before** defaulting to a vague web search: use the **memory block** in this message and call **remember()** for likely keys (e.g. \`city\`, \`location\`, \`home\`, \`neighborhood\`, \`work\`, \`area\`) — **memory_facts** may already name a city or region. If you find a concrete place there, use it in **google(maps)** and **search()** queries (e.g. "ramen Oakland") and tailor results to that area.

Only if there is **no** usable city or area in memory or the transcript, add a short friendly line asking which city or area to search in — never invent a precise location.`;
  }
  return '';
}
