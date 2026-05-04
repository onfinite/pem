import type { ClientMessage } from "@/lib/chatScreenClientMessage.types";

export type ChatDisplayItem =
  | { type: "message"; message: ClientMessage }
  | { type: "date"; date: string };

export function buildChatDisplayItems(messages: ClientMessage[]): ChatDisplayItem[] {
  const displayItems: ChatDisplayItem[] = [];
  const seenIds = new Set<string>();
  const deduped: ClientMessage[] = [];
  for (const msg of messages) {
    if (seenIds.has(msg.id)) continue;
    seenIds.add(msg.id);
    deduped.push(msg);
  }

  for (let i = deduped.length - 1; i >= 0; i--) {
    const msg = deduped[i];
    displayItems.push({ type: "message", message: msg });

    const msgDate = new Date(msg.created_at).toDateString();
    const prevMsg = deduped[i - 1];
    const prevDate = prevMsg
      ? new Date(prevMsg.created_at).toDateString()
      : null;
    if (msgDate !== prevDate) {
      displayItems.push({ type: "date", date: msg.created_at });
    }
  }

  return displayItems;
}
