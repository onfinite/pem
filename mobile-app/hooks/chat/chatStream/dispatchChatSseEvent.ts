import type { ApiMessage } from "@/services/api/pemApi";
import type {
  ChatIntegrationNoticePayload,
  ChatStreamCallbacks,
} from "@/hooks/chat/chatStream/chatStream.types";

export function dispatchChatSseEvent(
  event: { data?: string | null; type?: string },
  callbacks: ChatStreamCallbacks,
): void {
  const raw = event.data;
  if (typeof raw !== "string" || raw.length === 0) return;
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const eventType = event.type;

    if (eventType === "pem_message" && data.message) {
      callbacks.onPemMessage?.(data.message as ApiMessage);
    } else if (eventType === "user_message" && data.message) {
      callbacks.onUserMessage?.(data.message as ApiMessage);
    } else if (
      eventType === "integration_notice" &&
      typeof data.kind === "string"
    ) {
      callbacks.onIntegrationNotice?.(data as ChatIntegrationNoticePayload);
    } else if (eventType === "status") {
      callbacks.onStatus?.(data.messageId as string, data.text as string);
    } else if (eventType === "message_updated") {
      callbacks.onMessageUpdated?.(
        data.messageId as string,
        data.field as string,
        data.value,
      );
    } else if (eventType === "pem_token") {
      callbacks.onToken?.(data.token as string);
    } else if (eventType === "pem_stream_done") {
      callbacks.onStreamDone?.(data.messageId as string);
    } else if (eventType === "tasks_updated") {
      callbacks.onTasksUpdated?.();
    }
  } catch {
    /* ignore parse errors */
  }
}
