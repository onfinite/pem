import { getApiBaseUrl } from "@/lib/apiBaseUrl";
import type { ApiMessage } from "@/lib/pemApi";
import { useAuth } from "@clerk/expo";
import { useCallback, useEffect, useRef } from "react";
import EventSource from "react-native-sse";

export type ChatStreamCallbacks = {
  onPemMessage?: (message: ApiMessage) => void;
  onStatus?: (messageId: string, text: string) => void;
  onMessageUpdated?: (messageId: string, field: string, value: unknown) => void;
  onToken?: (token: string) => void;
  onStreamDone?: (messageId: string) => void;
  onTasksUpdated?: () => void;
};

type ChatSseEvents = "pem_message" | "status" | "message_updated" | "pem_token" | "pem_stream_done" | "tasks_updated";

const MAX_RECONNECT_DELAY = 30_000;

export function useChatStream(callbacks: ChatStreamCallbacks) {
  const { getToken } = useAuth();
  const esRef = useRef<EventSource<ChatSseEvents> | null>(null);
  const cbRef = useRef(callbacks);
  cbRef.current = callbacks;
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const attemptRef = useRef(0);
  const mountedRef = useRef(true);

  const disconnect = useCallback(() => {
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    esRef.current?.removeAllEventListeners();
    esRef.current?.close();
    esRef.current = null;
  }, []);

  const connect = useCallback(() => {
    void (async () => {
      if (!mountedRef.current) return;

      const token = await getTokenRef.current();
      if (!token) {
        // Token not available yet — retry after a short delay, don't spam
        reconnectTimer.current = setTimeout(() => {
          if (mountedRef.current) connect();
        }, 2000);
        return;
      }

      disconnect();

      const url = `${getApiBaseUrl()}/chat/stream`;
      const es = new EventSource<ChatSseEvents>(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "text/event-stream",
        },
      });
      esRef.current = es;

      const handler = (event: { data?: string | null; type?: string }) => {
        const raw = event.data;
        if (typeof raw !== "string" || raw.length === 0) return;
        try {
          const data = JSON.parse(raw);
          const eventType = event.type;

          if (eventType === "pem_message" && data.message) {
            cbRef.current.onPemMessage?.(data.message as ApiMessage);
          } else if (eventType === "status") {
            cbRef.current.onStatus?.(data.messageId, data.text);
          } else if (eventType === "message_updated") {
            cbRef.current.onMessageUpdated?.(data.messageId, data.field, data.value);
          } else if (eventType === "pem_token") {
            cbRef.current.onToken?.(data.token);
          } else if (eventType === "pem_stream_done") {
            cbRef.current.onStreamDone?.(data.messageId);
          } else if (eventType === "tasks_updated") {
            cbRef.current.onTasksUpdated?.();
          }
        } catch { /* ignore parse errors */ }
      };

      es.addEventListener("pem_message", handler);
      es.addEventListener("status", handler);
      es.addEventListener("message_updated", handler);
      es.addEventListener("pem_token", handler);
      es.addEventListener("pem_stream_done", handler);
      es.addEventListener("tasks_updated", handler);

      // On open — reset reconnect backoff
      es.addEventListener("open" as any, () => {
        attemptRef.current = 0;
      });

      // On error — reconnect with exponential backoff + fresh token
      es.addEventListener("error" as any, () => {
        if (!mountedRef.current) return;
        disconnect();
        attemptRef.current += 1;
        const delay = Math.min(1000 * 2 ** attemptRef.current, MAX_RECONNECT_DELAY);
        reconnectTimer.current = setTimeout(() => {
          if (mountedRef.current) connect();
        }, delay);
      });
    })();
  }, [disconnect]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      disconnect();
    };
  }, [connect, disconnect]);

  return { reconnect: connect, disconnect };
}
