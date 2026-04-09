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
};

type ChatSseEvents = "pem_message" | "status" | "message_updated" | "pem_token" | "pem_stream_done";

export function useChatStream(callbacks: ChatStreamCallbacks) {
  const { getToken } = useAuth();
  const esRef = useRef<EventSource<ChatSseEvents> | null>(null);
  const cbRef = useRef(callbacks);
  cbRef.current = callbacks;
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const connect = useCallback(() => {
    void (async () => {
      const token = await getTokenRef.current();
      if (!token) return;

      if (esRef.current) {
        esRef.current.removeAllEventListeners();
        esRef.current.close();
      }

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
          }
        } catch { /* ignore parse errors */ }
      };

      es.addEventListener("pem_message", handler);
      es.addEventListener("status", handler);
      es.addEventListener("message_updated", handler);
      es.addEventListener("pem_token", handler);
      es.addEventListener("pem_stream_done", handler);
    })();
  }, []);

  const disconnect = useCallback(() => {
    esRef.current?.removeAllEventListeners();
    esRef.current?.close();
    esRef.current = null;
  }, []);

  useEffect(() => {
    connect();
    return disconnect;
  }, [connect, disconnect]);

  return { reconnect: connect, disconnect };
}
