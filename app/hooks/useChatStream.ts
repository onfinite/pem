import { useAuth } from "@clerk/expo";
import { useCallback, useEffect, useRef } from "react";
import EventSource from "react-native-sse";
import type { ChatSseEvents, ChatStreamCallbacks } from "./chatStream/chatStream.types";
import { openChatStreamConnection } from "./chatStream/openChatStreamConnection";

export type { ChatStreamCallbacks } from "./chatStream/chatStream.types";

export function useChatStream(callbacks: ChatStreamCallbacks) {
  const { getToken } = useAuth();
  const esRef = useRef<EventSource<ChatSseEvents> | null>(null);
  const cbRef = useRef(callbacks);
  cbRef.current = callbacks;
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const attemptRef = useRef(0);
  const mountedRef = useRef(true);

  const disconnect = useCallback(() => {
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    esRef.current?.removeAllEventListeners();
    esRef.current?.close();
    esRef.current = null;
  }, []);

  const connect = useCallback(() => {
    openChatStreamConnection({
      mountedRef,
      getToken: () => getTokenRef.current(),
      disconnect,
      esRef,
      cbRef,
      reconnectTimer,
      attemptRef,
      scheduleReconnect: () => connect(),
    });
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
