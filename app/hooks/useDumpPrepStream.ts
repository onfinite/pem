import { getApiBaseUrl } from "@/lib/apiBaseUrl";
import { listPrepsPage, type ApiPrep } from "@/lib/pemApi";
import { useCallback, useEffect, useRef, useState } from "react";
import EventSource from "react-native-sse";

type StreamPayload = {
  type?: string;
  prep?: {
    id: string;
    thought?: string;
    intent?: string | null;
    status?: string;
    render_type?: string | null;
    summary?: string | null;
    result?: Record<string, unknown> | null;
    /** ISO — from API; required for stable DESC order vs fake “now”. */
    created_at?: string;
  };
  dumpId?: string;
};

function sortPrepsByCreatedAtDesc(rows: ApiPrep[]): ApiPrep[] {
  return [...rows].sort((a, b) => {
    const ta = Date.parse(a.created_at);
    const tb = Date.parse(b.created_at);
    if (tb !== ta) return tb - ta;
    return b.id.localeCompare(a.id);
  });
}

function partialToApiPrep(p: NonNullable<StreamPayload["prep"]>, dumpId: string): ApiPrep {
  const thought = p.thought ?? "";
  const st = p.status ?? "prepping";
  const rt = p.render_type ?? "search";
  const created =
    typeof p.created_at === "string" && p.created_at.length > 0
      ? p.created_at
      : new Date().toISOString();
  return {
    id: p.id,
    dump_id: dumpId,
    title: thought.slice(0, 200),
    thought,
    intent: p.intent ?? null,
    prep_type: rt,
    render_type: p.render_type ?? null,
    status: st as ApiPrep["status"],
    summary: p.summary ?? null,
    result: p.result ?? null,
    error_message: null,
    opened_at: null,
    created_at: created,
    ready_at: st === "ready" ? new Date().toISOString() : null,
    archived_at: null,
  };
}

/**
 * Subscribes to GET /preps/stream for a dump, merges into the hub, and keeps
 * dump-scoped rows for the post-dump screen (not limited to the hub’s first page).
 */
export function useDumpPrepStream(
  dumpId: string | undefined,
  getToken: () => Promise<string | null>,
  upsertPrepRow: (row: ApiPrep) => void,
): {
  streamDone: boolean;
  dumpPreps: ApiPrep[];
  loadingDumpPreps: boolean;
  refetchDumpPreps: () => Promise<void>;
} {
  const [streamDone, setStreamDone] = useState(false);
  const [dumpScopedRows, setDumpScopedRows] = useState<ApiPrep[]>([]);
  const [loadingDumpPreps, setLoadingDumpPreps] = useState(false);
  const esRef = useRef<InstanceType<typeof EventSource> | null>(null);
  /** Clerk’s getToken changes identity often; putting it in effect deps caused refetch + SSE reconnect loops. */
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const refetchDumpPreps = useCallback(() => {
    if (!dumpId) {
      setDumpScopedRows([]);
      return Promise.resolve();
    }
    setLoadingDumpPreps(true);
    return listPrepsPage(getTokenRef.current, {
      dumpId,
      status: "prepping",
      limit: 100,
    })
      .then((r) => setDumpScopedRows(sortPrepsByCreatedAtDesc(r.items)))
      .catch(() => {
        setDumpScopedRows([]);
      })
      .finally(() => {
        setLoadingDumpPreps(false);
      });
  }, [dumpId]);

  useEffect(() => {
    if (!dumpId) {
      setDumpScopedRows([]);
      return;
    }
    void refetchDumpPreps();
  }, [dumpId, refetchDumpPreps]);

  const mergeDumpScoped = useCallback(
    (row: ApiPrep) => {
      if (row.dump_id !== dumpId) return;
      setDumpScopedRows((prev) => {
        const rest = prev.filter((x) => x.id !== row.id);
        if (row.status === "prepping" || row.status === "failed") {
          return sortPrepsByCreatedAtDesc([...rest, row]);
        }
        return rest.filter((x) => x.id !== row.id);
      });
    },
    [dumpId],
  );

  const onData = useCallback(
    (raw: string, fallbackDumpId: string) => {
      let payload: StreamPayload;
      try {
        payload = JSON.parse(raw) as StreamPayload;
      } catch {
        return;
      }
      if (payload.type === "stream.done") {
        setStreamDone(true);
        esRef.current?.removeAllEventListeners();
        esRef.current?.close();
        esRef.current = null;
        return;
      }
      if (
        payload.prep &&
        (payload.type === "prep.created" ||
          payload.type === "prep.ready" ||
          payload.type === "prep.failed")
      ) {
        const d = payload.dumpId ?? fallbackDumpId;
        const row = partialToApiPrep(payload.prep, d);
        upsertPrepRow(row);
        mergeDumpScoped(row);
      }
    },
    [upsertPrepRow, mergeDumpScoped],
  );

  const onDataRef = useRef(onData);
  onDataRef.current = onData;

  useEffect(() => {
    if (!dumpId) return;

    setStreamDone(false);
    let cancelled = false;

    void (async () => {
      try {
        const token = await getTokenRef.current();
        if (!token || cancelled) return;

        const url = `${getApiBaseUrl()}/preps/stream?dumpId=${encodeURIComponent(dumpId)}`;
        const es = new EventSource(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "text/event-stream",
          },
        });
        esRef.current = es;

        const listener: (event: { data?: string | null }) => void = (event) => {
          const d = event.data;
          if (typeof d === "string" && d.length > 0) {
            onDataRef.current(d, dumpId);
          }
        };

        es.addEventListener("message", listener);
      } catch {
        /* avoid uncaught rejections if token or EventSource fails */
      }
    })();

    return () => {
      cancelled = true;
      esRef.current?.removeAllEventListeners();
      esRef.current?.close();
      esRef.current = null;
    };
  }, [dumpId]);

  return { streamDone, dumpPreps: dumpScopedRows, loadingDumpPreps, refetchDumpPreps };
}
