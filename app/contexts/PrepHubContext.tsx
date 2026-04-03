import type { Prep, PrepTab } from "@/components/sections/home-sections/homePrepData";
import { PREP_PAGE_SIZE } from "@/constants/limits";
import {
  apiPrepToPrep,
  archivePrepApi,
  getPrepById,
  listPrepsPage,
  retryPrepApi,
  unarchivePrepApi,
  type ApiPrep,
} from "@/lib/pemApi";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@clerk/expo";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState, type AppStateStatus } from "react-native";

/** Pass `skipCacheHydration` on pull-to-refresh so lists don’t flash stale disk cache before the API returns. */
export type PrepHubRefreshOptions = { skipCacheHydration?: boolean };

export type HomeNavigationIntent = { tab: PrepTab; toast: string };

type PrepHubContextValue = {
  readyPreps: Prep[];
  preppingPreps: Prep[];
  archivedPreps: Prep[];
  archivePrep: (id: string) => Promise<void>;
  unarchivePrep: (id: string) => Promise<void>;
  retryPrep: (id: string) => Promise<void>;
  /** Call before navigating to home so the hub can switch tab + show a toast (e.g. after archive). */
  scheduleHomeNavigationIntent: (tab: PrepTab, toast: string) => void;
  consumeHomeNavigationIntent: () => HomeNavigationIntent | null;
  getPrep: (id: string) => Prep | undefined;
  fetchPrepById: (id: string) => Promise<Prep | null>;
  upsertPrepRow: (row: ApiPrep) => void;
  refresh: (opts?: PrepHubRefreshOptions) => Promise<void>;
  loadMore: (tab: "ready" | "prepping" | "archived") => Promise<void>;
  hasMore: { ready: boolean; prepping: boolean; archived: boolean };
  loadingMore: { ready: boolean; prepping: boolean; archived: boolean };
  loading: boolean;
  error: string | null;
};

const PrepHubContext = createContext<PrepHubContextValue | null>(null);

function prepsCacheKey(userId: string | undefined) {
  return userId ? `preps:${userId}` : null;
}

/** Newest first — matches API `ORDER BY created_at DESC, id DESC`. */
function sortPrepsByCreatedAtDesc(rows: ApiPrep[]): ApiPrep[] {
  return [...rows].sort((a, b) => {
    const ta = Date.parse(a.created_at);
    const tb = Date.parse(b.created_at);
    if (tb !== ta) return tb - ta;
    return b.id.localeCompare(a.id);
  });
}

type TabKey = "ready" | "prepping" | "archived";

export function PrepHubProvider({ children }: { children: ReactNode }) {
  const { getToken, isSignedIn, userId } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const [readyRows, setReadyRows] = useState<ApiPrep[]>([]);
  const [preppingRows, setPreppingRows] = useState<ApiPrep[]>([]);
  const [archivedRows, setArchivedRows] = useState<ApiPrep[]>([]);
  const [cursors, setCursors] = useState<{
    ready: string | null;
    prepping: string | null;
    archived: string | null;
  }>({ ready: null, prepping: null, archived: null });
  const [loadingMore, setLoadingMore] = useState({
    ready: false,
    prepping: false,
    archived: false,
  });
  const loadingMoreRef = useRef(loadingMore);
  loadingMoreRef.current = loadingMore;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const homeNavigationIntentRef = useRef<HomeNavigationIntent | null>(null);

  const scheduleHomeNavigationIntent = useCallback((tab: PrepTab, toast: string) => {
    homeNavigationIntentRef.current = { tab, toast };
  }, []);

  const consumeHomeNavigationIntent = useCallback((): HomeNavigationIntent | null => {
    const v = homeNavigationIntentRef.current;
    homeNavigationIntentRef.current = null;
    return v;
  }, []);

  const upsertPrepRow = useCallback((row: ApiPrep) => {
    setReadyRows((prev) => {
      const rest = prev.filter((x) => x.id !== row.id);
      if (row.status === "ready") {
        return sortPrepsByCreatedAtDesc([...rest, row]);
      }
      return rest;
    });
    setPreppingRows((prev) => {
      const rest = prev.filter((x) => x.id !== row.id);
      if (row.status === "prepping" || row.status === "failed") {
        return sortPrepsByCreatedAtDesc([...rest, row]);
      }
      return rest;
    });
    setArchivedRows((prev) => {
      const rest = prev.filter((x) => x.id !== row.id);
      if (row.status === "archived") {
        return sortPrepsByCreatedAtDesc([...rest, row]);
      }
      return rest;
    });
  }, []);

  const refresh = useCallback(async (opts?: PrepHubRefreshOptions) => {
    if (!isSignedIn) {
      setReadyRows([]);
      setPreppingRows([]);
      setArchivedRows([]);
      setCursors({ ready: null, prepping: null, archived: null });
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const key = prepsCacheKey(userId ?? undefined);
      if (!opts?.skipCacheHydration && key) {
        const cached = await AsyncStorage.getItem(key);
        if (cached) {
          try {
            const parsed = JSON.parse(cached) as {
              v?: number;
              ready?: ApiPrep[];
              prepping?: ApiPrep[];
              archived?: ApiPrep[];
            };
            if (parsed.v === 2 && parsed.ready && parsed.prepping && parsed.archived) {
              setReadyRows(sortPrepsByCreatedAtDesc(parsed.ready));
              setPreppingRows(sortPrepsByCreatedAtDesc(parsed.prepping));
              setArchivedRows(sortPrepsByCreatedAtDesc(parsed.archived));
              setLoading(false);
            }
          } catch {
            /* ignore */
          }
        }
      }
      const [r, p, a] = await Promise.all([
        listPrepsPage(getTokenRef.current, {
          status: "ready",
          limit: PREP_PAGE_SIZE,
        }),
        listPrepsPage(getTokenRef.current, {
          status: "prepping",
          limit: PREP_PAGE_SIZE,
        }),
        listPrepsPage(getTokenRef.current, {
          status: "archived",
          limit: PREP_PAGE_SIZE,
        }),
      ]);
      setReadyRows(sortPrepsByCreatedAtDesc(r.items));
      setPreppingRows(sortPrepsByCreatedAtDesc(p.items));
      setArchivedRows(sortPrepsByCreatedAtDesc(a.items));
      setCursors({
        ready: r.next_cursor,
        prepping: p.next_cursor,
        archived: a.next_cursor,
      });
      if (key) {
        await AsyncStorage.setItem(
          key,
          JSON.stringify({
            v: 2,
            ready: r.items,
            prepping: p.items,
            archived: a.items,
          }),
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [isSignedIn, userId]);

  const loadMore = useCallback(async (tab: TabKey) => {
    const cursor = cursors[tab];
    if (!cursor || loadingMoreRef.current[tab]) return;
    setLoadingMore((m) => ({ ...m, [tab]: true }));
    try {
      const status = tab === "archived" ? "archived" : tab === "ready" ? "ready" : "prepping";
      const res = await listPrepsPage(getTokenRef.current, {
        status,
        limit: PREP_PAGE_SIZE,
        cursor,
      });
      if (tab === "ready") {
        setReadyRows((prev) => sortPrepsByCreatedAtDesc([...prev, ...res.items]));
      } else if (tab === "prepping") {
        setPreppingRows((prev) => sortPrepsByCreatedAtDesc([...prev, ...res.items]));
      } else {
        setArchivedRows((prev) => sortPrepsByCreatedAtDesc([...prev, ...res.items]));
      }
      setCursors((c) => ({ ...c, [tab]: res.next_cursor }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setLoadingMore((m) => ({ ...m, [tab]: false }));
    }
  }, [cursors]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (next === "active") {
        void refresh();
      }
    });
    return () => sub.remove();
  }, [refresh]);

  const readyPreps = useMemo(() => readyRows.map(apiPrepToPrep), [readyRows]);

  const preppingPreps = useMemo(() => preppingRows.map(apiPrepToPrep), [preppingRows]);

  const archivedPreps = useMemo(() => archivedRows.map(apiPrepToPrep), [archivedRows]);

  const hasMore = useMemo(
    () => ({
      ready: Boolean(cursors.ready),
      prepping: Boolean(cursors.prepping),
      archived: Boolean(cursors.archived),
    }),
    [cursors],
  );

  const getPrep = useCallback(
    (id: string) => {
      const r = [...readyRows, ...preppingRows, ...archivedRows].find((p) => p.id === id);
      return r ? apiPrepToPrep(r) : undefined;
    },
    [readyRows, preppingRows, archivedRows],
  );

  const fetchPrepById = useCallback(async (id: string) => {
    try {
      const r = await getPrepById(getTokenRef.current, id);
      upsertPrepRow(r);
      return apiPrepToPrep(r);
    } catch {
      return null;
    }
  }, [upsertPrepRow]);

  const archivePrep = useCallback(
    async (id: string) => {
      const row = await archivePrepApi(getTokenRef.current, id);
      upsertPrepRow(row);
      await refresh();
    },
    [refresh, upsertPrepRow],
  );

  const unarchivePrep = useCallback(
    async (id: string) => {
      const row = await unarchivePrepApi(getTokenRef.current, id);
      upsertPrepRow(row);
      await refresh();
    },
    [refresh, upsertPrepRow],
  );

  const retryPrep = useCallback(
    async (id: string) => {
      await retryPrepApi(getTokenRef.current, id);
      await refresh();
    },
    [refresh],
  );

  const value = useMemo(
    () => ({
      readyPreps,
      preppingPreps,
      archivedPreps,
      archivePrep,
      unarchivePrep,
      retryPrep,
      scheduleHomeNavigationIntent,
      consumeHomeNavigationIntent,
      getPrep,
      fetchPrepById,
      upsertPrepRow,
      refresh,
      loadMore,
      hasMore,
      loadingMore,
      loading,
      error,
    }),
    [
      readyPreps,
      preppingPreps,
      archivedPreps,
      archivePrep,
      unarchivePrep,
      retryPrep,
      scheduleHomeNavigationIntent,
      consumeHomeNavigationIntent,
      getPrep,
      fetchPrepById,
      upsertPrepRow,
      refresh,
      loadMore,
      hasMore,
      loadingMore,
      loading,
      error,
    ],
  );

  return <PrepHubContext.Provider value={value}>{children}</PrepHubContext.Provider>;
}

export function usePrepHub() {
  const ctx = useContext(PrepHubContext);
  if (!ctx) {
    throw new Error("usePrepHub must be used within PrepHubProvider");
  }
  return ctx;
}
