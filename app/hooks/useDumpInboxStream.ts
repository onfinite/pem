import { getApiBaseUrl } from "@/lib/apiBaseUrl";
import { useAuth } from "@clerk/expo";
import { useCallback, useEffect, useRef, useState } from "react";
import EventSource from "react-native-sse";

/**
 * SSE after dump: listens until `stream.done` in payload JSON.
 */
export function useDumpInboxStream(dumpId: string | null) {
  const { getToken } = useAuth();
  const [done, setDone] = useState(false);
  const esRef = useRef<InstanceType<typeof EventSource> | null>(null);
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const reset = useCallback(() => {
    setDone(false);
  }, []);

  useEffect(() => {
    if (!dumpId) return;

    setDone(false);
    let cancelled = false;

    void (async () => {
      const token = await getTokenRef.current();
      if (!token || cancelled) return;

      const url = `${getApiBaseUrl()}/inbox/stream?dumpId=${encodeURIComponent(dumpId)}`;
      const es = new EventSource(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "text/event-stream",
        },
      });
      esRef.current = es;

      const listener: (event: { data?: string | null }) => void = (event) => {
        const ev = event.data;
        if (typeof ev !== "string" || ev.length === 0) return;
        try {
          const payload = JSON.parse(ev) as { type?: string };
          if (payload.type === "stream.done") {
            setDone(true);
            es.removeAllEventListeners();
            es.close();
            esRef.current = null;
          }
        } catch {
          /* ignore */
        }
      };

      es.addEventListener("message", listener);
    })();

    return () => {
      cancelled = true;
      esRef.current?.removeAllEventListeners();
      esRef.current?.close();
      esRef.current = null;
    };
  }, [dumpId]);

  return { streamDone: done, reset };
}
