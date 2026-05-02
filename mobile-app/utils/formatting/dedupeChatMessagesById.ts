import type { ClientMessage } from "@/lib/chatScreenClientMessage.types";

/** Keeps the first occurrence when optimistic + SSE both insert the same server id. */
export function dedupeChatMessagesById(
  messages: ClientMessage[],
): ClientMessage[] {
  const seen = new Set<string>();
  const out: ClientMessage[] = [];
  for (const m of messages) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    out.push(m);
  }
  return out;
}
