import type { Prep, PrepTab } from "@/components/sections/home-sections/homePrepData";
import { PREP_PAGE_SIZE } from "@/constants/limits";
import {
  apiPrepToPrep,
  archivePrepApi,
  deletePrepApi,
  fetchPrepCounts,
  getPrepById,
  listPrepsPage,
  retryPrepApi,
  unarchivePrepApi,
  type ApiPrep,
  type PrepCountsResponse,
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
import {
  AppState,
  LayoutAnimation,
  Platform,
  UIManager,
  type AppStateStatus,
} from "react-native";

/** Pass `skipCacheHydration` on pull-to-refresh so lists don’t flash stale disk cache before the API returns. */
export type PrepHubRefreshOptions = { skipCacheHydration?: boolean };

export type HomeNavigationIntent = { tab: PrepTab; toast?: string };

export type HubToastPayload = {
  message: string;
  undo?: () => Promise<void>;
};

type PrepHubContextValue = {
  /** Root prep rows from API (hub lists roots only; same count as hub tabs). */
  readyPrepRows: ApiPrep[];
  preppingPrepRows: ApiPrep[];
  archivedPrepRows: ApiPrep[];
  readyPreps: Prep[];
  preppingPreps: Prep[];
  archivedPreps: Prep[];
  archivePrep: (id: string) => Promise<void>;
  unarchivePrep: (id: string) => Promise<void>;
  retryPrep: (id: string) => Promise<void>;
  deletePrep: (id: string) => Promise<void>;
  /** Call before navigating to home so the hub can switch tab + show a toast (e.g. after archive → stay on Ready). */
  scheduleHomeNavigationIntent: (tab: PrepTab, toast?: string) => void;
  consumeHomeNavigationIntent: () => HomeNavigationIntent | null;
  /** Ephemeral banner (hub + detail) — bottom snack with optional Undo. */
  hubToast: HubToastPayload | null;
  showHubToast: (message: string, undo?: () => Promise<void>) => void;
  dismissHubToast: () => void;
  getPrep: (id: string) => Prep | undefined;
  fetchPrepById: (id: string) => Promise<Prep | null>;
  upsertPrepRow: (row: ApiPrep) => void;
  refresh: (opts?: PrepHubRefreshOptions) => Promise<void>;
  loadMore: (tab: "ready" | "prepping" | "archived") => Promise<void>;
  hasMore: { ready: boolean; prepping: boolean; archived: boolean };
  loadingMore: { ready: boolean; prepping: boolean; archived: boolean };
  /** Exact totals from GET /preps/counts (null before first successful refresh). */
  prepCounts: PrepCountsResponse | null;
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

/** One row per prep id (later rows win — e.g. pagination overlap or bad API pages). */
function dedupePrepsById(rows: ApiPrep[]): ApiPrep[] {
  const map = new Map<string, ApiPrep>();
  for (const x of rows) {
    map.set(x.id, x);
  }
  return sortPrepsByCreatedAtDesc([...map.values()]);
}

type TabKey = "ready" | "prepping" | "archived";

const CACHE_VERSION = 4;

function applyHubLayoutAnimation() {
  if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
}

export function PrepHubProvider({ children }: { children: ReactNode }) {
  const { getToken, isSignedIn, userId } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const [readyPrepRows, setReadyPrepRows] = useState<ApiPrep[]>([]);
  const [preppingPrepRows, setPreppingPrepRows] = useState<ApiPrep[]>([]);
  const [archivedPrepRows, setArchivedPrepRows] = useState<ApiPrep[]>([]);
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
  const [prepCounts, setPrepCounts] = useState<PrepCountsResponse | null>(null);

  const homeNavigationIntentRef = useRef<HomeNavigationIntent | null>(null);

  const hubOpTokenRef = useRef<Map<string, number>>(new Map());
  const archiveInflightRef = useRef<Map<string, Promise<ApiPrep>>>(new Map());
  const unarchiveInflightRef = useRef<Map<string, Promise<ApiPrep>>>(new Map());

  const bumpHubOpToken = useCallback((id: string) => {
    const n = (hubOpTokenRef.current.get(id) ?? 0) + 1;
    hubOpTokenRef.current.set(id, n);
    return n;
  }, []);

  const readHubOpToken = useCallback((id: string) => hubOpTokenRef.current.get(id) ?? 0, []);

  const [hubToast, setHubToast] = useState<HubToastPayload | null>(null);

  const showHubToast = useCallback((message: string, undo?: () => Promise<void>) => {
    setHubToast({ message, undo });
  }, []);

  const dismissHubToast = useCallback(() => {
    setHubToast(null);
  }, []);

  const scheduleHomeNavigationIntent = useCallback((tab: PrepTab, toast?: string) => {
    homeNavigationIntentRef.current = { tab, toast };
  }, []);

  const consumeHomeNavigationIntent = useCallback((): HomeNavigationIntent | null => {
    const v = homeNavigationIntentRef.current;
    homeNavigationIntentRef.current = null;
    return v;
  }, []);

  const upsertPrepRow = useCallback((row: ApiPrep) => {
    setReadyPrepRows((prev) => {
      const rest = prev.filter((x) => x.id !== row.id);
      if (row.status === "ready") {
        return sortPrepsByCreatedAtDesc([...rest, row]);
      }
      return rest;
    });
    setPreppingPrepRows((prev) => {
      const rest = prev.filter((x) => x.id !== row.id);
      if (row.status === "prepping" || row.status === "failed") {
        return sortPrepsByCreatedAtDesc([...rest, row]);
      }
      return rest;
    });
    setArchivedPrepRows((prev) => {
      const rest = prev.filter((x) => x.id !== row.id);
      if (row.status === "archived") {
        return sortPrepsByCreatedAtDesc([...rest, row]);
      }
      return rest;
    });
  }, []);

  const refresh = useCallback(async (opts?: PrepHubRefreshOptions) => {
    if (!isSignedIn) {
      setReadyPrepRows([]);
      setPreppingPrepRows([]);
      setArchivedPrepRows([]);
      setPrepCounts(null);
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
            if (
              parsed.v === CACHE_VERSION &&
              parsed.ready &&
              parsed.prepping &&
              parsed.archived
            ) {
              setReadyPrepRows(dedupePrepsById(parsed.ready));
              setPreppingPrepRows(dedupePrepsById(parsed.prepping));
              setArchivedPrepRows(dedupePrepsById(parsed.archived));
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
      try {
        const c = await fetchPrepCounts(getTokenRef.current);
        setPrepCounts(c);
      } catch {
        setPrepCounts(null);
      }
      setReadyPrepRows(dedupePrepsById(r.items));
      setPreppingPrepRows(dedupePrepsById(p.items));
      setArchivedPrepRows(dedupePrepsById(a.items));
      setCursors({
        ready: r.next_cursor,
        prepping: p.next_cursor,
        archived: a.next_cursor,
      });
      if (key) {
        await AsyncStorage.setItem(
          key,
          JSON.stringify({
            v: CACHE_VERSION,
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
        setReadyPrepRows((prev) => dedupePrepsById([...prev, ...res.items]));
      } else if (tab === "prepping") {
        setPreppingPrepRows((prev) => dedupePrepsById([...prev, ...res.items]));
      } else {
        setArchivedPrepRows((prev) => dedupePrepsById([...prev, ...res.items]));
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

  const readyPreps = useMemo(() => readyPrepRows.map(apiPrepToPrep), [readyPrepRows]);

  const preppingPreps = useMemo(() => preppingPrepRows.map(apiPrepToPrep), [preppingPrepRows]);

  const archivedPreps = useMemo(() => archivedPrepRows.map(apiPrepToPrep), [archivedPrepRows]);

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
      const r = [...readyPrepRows, ...preppingPrepRows, ...archivedPrepRows].find((p) => p.id === id);
      return r ? apiPrepToPrep(r) : undefined;
    },
    [readyPrepRows, preppingPrepRows, archivedPrepRows],
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

  const removeIdFromAllLists = useCallback((id: string) => {
    setReadyPrepRows((prev) => prev.filter((x) => x.id !== id));
    setPreppingPrepRows((prev) => prev.filter((x) => x.id !== id));
    setArchivedPrepRows((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const restoreSnapshotFromApiPrep = useCallback((snapshot: ApiPrep) => {
    const id = snapshot.id;
    setReadyPrepRows((prev) => prev.filter((x) => x.id !== id));
    setPreppingPrepRows((prev) => prev.filter((x) => x.id !== id));
    setArchivedPrepRows((prev) => prev.filter((x) => x.id !== id));
    if (snapshot.status === "ready") {
      setReadyPrepRows((prev) => sortPrepsByCreatedAtDesc([...prev, snapshot]));
    } else if (snapshot.status === "prepping" || snapshot.status === "failed") {
      setPreppingPrepRows((prev) => sortPrepsByCreatedAtDesc([...prev, snapshot]));
    } else if (snapshot.status === "archived") {
      setArchivedPrepRows((prev) => sortPrepsByCreatedAtDesc([...prev, snapshot]));
    }
  }, []);

  const findPrepRow = useCallback(
    (id: string): ApiPrep | undefined =>
      readyPrepRows.find((x) => x.id === id) ??
      preppingPrepRows.find((x) => x.id === id) ??
      archivedPrepRows.find((x) => x.id === id),
    [readyPrepRows, preppingPrepRows, archivedPrepRows],
  );

  const bumpPrepCountsForArchive = useCallback((row: ApiPrep) => {
    setPrepCounts((c) => {
      if (!c) return c;
      if (row.status === "ready") {
        return { ...c, ready: Math.max(0, c.ready - 1), archived: c.archived + 1 };
      }
      if (row.status === "prepping" || row.status === "failed") {
        return { ...c, preparing: Math.max(0, c.preparing - 1), archived: c.archived + 1 };
      }
      return c;
    });
  }, []);

  const bumpPrepCountsRevertArchive = useCallback((snapshot: ApiPrep) => {
    setPrepCounts((c) => {
      if (!c) return c;
      if (snapshot.status === "ready") {
        return { ...c, ready: c.ready + 1, archived: Math.max(0, c.archived - 1) };
      }
      if (snapshot.status === "prepping" || snapshot.status === "failed") {
        return { ...c, preparing: c.preparing + 1, archived: Math.max(0, c.archived - 1) };
      }
      return c;
    });
  }, []);

  const bumpPrepCountsForUnarchive = useCallback(() => {
    setPrepCounts((c) =>
      c ? { ...c, archived: Math.max(0, c.archived - 1), ready: c.ready + 1 } : c,
    );
  }, []);

  const bumpPrepCountsRevertUnarchive = useCallback(() => {
    setPrepCounts((c) =>
      c ? { ...c, archived: c.archived + 1, ready: Math.max(0, c.ready - 1) } : c,
    );
  }, []);

  const bumpPrepCountsForDelete = useCallback((row: ApiPrep) => {
    setPrepCounts((c) => {
      if (!c) return c;
      if (row.status === "ready") return { ...c, ready: Math.max(0, c.ready - 1) };
      if (row.status === "prepping" || row.status === "failed") {
        return { ...c, preparing: Math.max(0, c.preparing - 1) };
      }
      if (row.status === "archived") return { ...c, archived: Math.max(0, c.archived - 1) };
      return c;
    });
  }, []);

  const bumpPrepCountsRevertDelete = useCallback((snapshot: ApiPrep) => {
    setPrepCounts((c) => {
      if (!c) return c;
      if (snapshot.status === "ready") return { ...c, ready: c.ready + 1 };
      if (snapshot.status === "prepping" || snapshot.status === "failed") {
        return { ...c, preparing: c.preparing + 1 };
      }
      if (snapshot.status === "archived") return { ...c, archived: c.archived + 1 };
      return c;
    });
  }, []);

  const syncCountsFromServer = useCallback(() => {
    void fetchPrepCounts(getTokenRef.current)
      .then(setPrepCounts)
      .catch(() => {});
  }, []);

  const archivePrep = useCallback(
    async (id: string) => {
      const row = findPrepRow(id);
      if (!row || row.status === "archived") return;
      const snapshot = { ...row };
      const token = bumpHubOpToken(id);
      applyHubLayoutAnimation();
      const archivedRow: ApiPrep = {
        ...row,
        status: "archived",
        archived_at: new Date().toISOString(),
      };
      removeIdFromAllLists(id);
      setArchivedPrepRows((prev) =>
        sortPrepsByCreatedAtDesc([...prev.filter((x) => x.id !== id), archivedRow]),
      );
      bumpPrepCountsForArchive(row);

      const undo = async () => {
        const inflight = archiveInflightRef.current.get(id);
        if (inflight) {
          try {
            await inflight;
          } catch {
            /* ignore */
          }
        }
        archiveInflightRef.current.delete(id);
        if (readHubOpToken(id) !== token) return;
        bumpHubOpToken(id);
        applyHubLayoutAnimation();
        restoreSnapshotFromApiPrep(snapshot);
        bumpPrepCountsRevertArchive(snapshot);
        try {
          await unarchivePrepApi(getTokenRef.current, id);
          syncCountsFromServer();
        } catch {
          await refresh();
        }
      };

      showHubToast("Archived", undo);

      const p = archivePrepApi(getTokenRef.current, id);
      archiveInflightRef.current.set(id, p);
      try {
        const serverRow = await p;
        archiveInflightRef.current.delete(id);
        if (readHubOpToken(id) !== token) return;
        upsertPrepRow(serverRow);
        syncCountsFromServer();
      } catch (e) {
        archiveInflightRef.current.delete(id);
        if (readHubOpToken(id) !== token) return;
        bumpHubOpToken(id);
        applyHubLayoutAnimation();
        restoreSnapshotFromApiPrep(snapshot);
        bumpPrepCountsRevertArchive(snapshot);
        dismissHubToast();
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        showHubToast("Couldn’t archive. Try again.");
      }
    },
    [
      findPrepRow,
      bumpHubOpToken,
      readHubOpToken,
      removeIdFromAllLists,
      bumpPrepCountsForArchive,
      bumpPrepCountsRevertArchive,
      restoreSnapshotFromApiPrep,
      showHubToast,
      dismissHubToast,
      upsertPrepRow,
      refresh,
      syncCountsFromServer,
    ],
  );

  const unarchivePrep = useCallback(
    async (id: string) => {
      const row = findPrepRow(id);
      if (!row || row.status !== "archived") return;
      const snapshot = { ...row };
      const token = bumpHubOpToken(id);
      applyHubLayoutAnimation();
      const readyRow: ApiPrep = { ...row, status: "ready", archived_at: null };
      removeIdFromAllLists(id);
      setReadyPrepRows((prev) =>
        sortPrepsByCreatedAtDesc([...prev.filter((x) => x.id !== id), readyRow]),
      );
      bumpPrepCountsForUnarchive();

      const undo = async () => {
        const inflight = unarchiveInflightRef.current.get(id);
        if (inflight) {
          try {
            await inflight;
          } catch {
            /* ignore */
          }
        }
        unarchiveInflightRef.current.delete(id);
        if (readHubOpToken(id) !== token) return;
        bumpHubOpToken(id);
        applyHubLayoutAnimation();
        restoreSnapshotFromApiPrep(snapshot);
        bumpPrepCountsRevertUnarchive();
        try {
          await archivePrepApi(getTokenRef.current, id);
          syncCountsFromServer();
        } catch {
          await refresh();
        }
      };

      showHubToast("Restored to For you", undo);

      const p = unarchivePrepApi(getTokenRef.current, id);
      unarchiveInflightRef.current.set(id, p);
      try {
        const serverRow = await p;
        unarchiveInflightRef.current.delete(id);
        if (readHubOpToken(id) !== token) return;
        upsertPrepRow(serverRow);
        syncCountsFromServer();
      } catch (e) {
        unarchiveInflightRef.current.delete(id);
        if (readHubOpToken(id) !== token) return;
        bumpHubOpToken(id);
        applyHubLayoutAnimation();
        restoreSnapshotFromApiPrep(snapshot);
        bumpPrepCountsRevertUnarchive();
        dismissHubToast();
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        showHubToast("Couldn’t restore. Try again.");
      }
    },
    [
      findPrepRow,
      bumpHubOpToken,
      readHubOpToken,
      removeIdFromAllLists,
      bumpPrepCountsForUnarchive,
      bumpPrepCountsRevertUnarchive,
      restoreSnapshotFromApiPrep,
      showHubToast,
      dismissHubToast,
      upsertPrepRow,
      refresh,
      syncCountsFromServer,
    ],
  );

  const retryPrep = useCallback(
    async (id: string) => {
      await retryPrepApi(getTokenRef.current, id);
      await refresh();
    },
    [refresh],
  );

  const deletePrep = useCallback(
    async (id: string) => {
      const row = findPrepRow(id);
      if (!row) return;
      const snapshot = { ...row };
      const token = bumpHubOpToken(id);
      applyHubLayoutAnimation();
      removeIdFromAllLists(id);
      bumpPrepCountsForDelete(row);
      showHubToast("Prep deleted");

      try {
        await deletePrepApi(getTokenRef.current, id);
        if (readHubOpToken(id) !== token) return;
        syncCountsFromServer();
      } catch (e) {
        if (readHubOpToken(id) !== token) return;
        bumpHubOpToken(id);
        applyHubLayoutAnimation();
        restoreSnapshotFromApiPrep(snapshot);
        bumpPrepCountsRevertDelete(snapshot);
        dismissHubToast();
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        showHubToast("Couldn’t delete prep. Try again.");
      }
    },
    [
      findPrepRow,
      bumpHubOpToken,
      readHubOpToken,
      removeIdFromAllLists,
      bumpPrepCountsForDelete,
      bumpPrepCountsRevertDelete,
      restoreSnapshotFromApiPrep,
      showHubToast,
      dismissHubToast,
      syncCountsFromServer,
    ],
  );

  const value = useMemo(
    () => ({
      readyPrepRows,
      preppingPrepRows,
      archivedPrepRows,
      readyPreps,
      preppingPreps,
      archivedPreps,
      archivePrep,
      unarchivePrep,
      retryPrep,
      deletePrep,
      scheduleHomeNavigationIntent,
      consumeHomeNavigationIntent,
      hubToast,
      showHubToast,
      dismissHubToast,
      getPrep,
      fetchPrepById,
      upsertPrepRow,
      refresh,
      loadMore,
      hasMore,
      loadingMore,
      prepCounts,
      loading,
      error,
    }),
    [
      readyPrepRows,
      preppingPrepRows,
      archivedPrepRows,
      readyPreps,
      preppingPreps,
      archivedPreps,
      archivePrep,
      unarchivePrep,
      retryPrep,
      deletePrep,
      scheduleHomeNavigationIntent,
      consumeHomeNavigationIntent,
      hubToast,
      showHubToast,
      dismissHubToast,
      getPrep,
      fetchPrepById,
      upsertPrepRow,
      refresh,
      loadMore,
      hasMore,
      loadingMore,
      prepCounts,
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
