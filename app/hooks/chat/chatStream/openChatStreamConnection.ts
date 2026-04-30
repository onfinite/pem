import { getApiBaseUrl } from "@/services/api/apiBaseUrl";
import type { MutableRefObject } from "react";
import EventSource from "react-native-sse";
import { CHAT_STREAM_MAX_RECONNECT_DELAY_MS } from "@/hooks/chat/chatStream/chatStream.constants";
import type { ChatSseEvents, ChatStreamCallbacks } from "@/hooks/chat/chatStream/chatStream.types";
import { dispatchChatSseEvent } from "@/hooks/chat/chatStream/dispatchChatSseEvent";

export function openChatStreamConnection(opts: {
  mountedRef: MutableRefObject<boolean>;
  getToken: () => Promise<string | null>;
  disconnect: () => void;
  esRef: MutableRefObject<EventSource<ChatSseEvents> | null>;
  cbRef: MutableRefObject<ChatStreamCallbacks>;
  reconnectTimer: MutableRefObject<ReturnType<typeof setTimeout> | undefined>;
  attemptRef: MutableRefObject<number>;
  scheduleReconnect: () => void;
}): void {
  void (async () => {
    if (!opts.mountedRef.current) return;

    const token = await opts.getToken();
    if (!token) {
      opts.reconnectTimer.current = setTimeout(() => {
        if (opts.mountedRef.current) opts.scheduleReconnect();
      }, 2000);
      return;
    }

    opts.disconnect();

    const url = `${getApiBaseUrl()}/chat/stream`;
    const es = new EventSource<ChatSseEvents>(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "text/event-stream",
      },
    });
    opts.esRef.current = es;

    const handler = (event: { data?: string | null; type?: string }) => {
      dispatchChatSseEvent(event, opts.cbRef.current);
    };

    es.addEventListener("pem_message", handler);
    es.addEventListener("status", handler);
    es.addEventListener("message_updated", handler);
    es.addEventListener("pem_token", handler);
    es.addEventListener("pem_stream_done", handler);
    es.addEventListener("tasks_updated", handler);

    es.addEventListener("open" as "pem_message", () => {
      opts.attemptRef.current = 0;
    });

    es.addEventListener("error" as "pem_message", () => {
      if (!opts.mountedRef.current) return;
      opts.disconnect();
      opts.attemptRef.current += 1;
      const delay = Math.min(
        1000 * 2 ** opts.attemptRef.current,
        CHAT_STREAM_MAX_RECONNECT_DELAY_MS,
      );
      opts.reconnectTimer.current = setTimeout(() => {
        if (opts.mountedRef.current) opts.scheduleReconnect();
      }, delay);
    });
  })();
}
