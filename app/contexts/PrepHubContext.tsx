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
  setPrepDoneApi,
  starPrepApi,
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
  /** Ready rows with session optimistic `opened_at` applied — use for Inbox sort, unread count, badges. */
  readyPrepRowsEffective: ApiPrep[];
  preppingPrepRows: ApiPrep[];
  archivedPrepRows: ApiPrep[];
  starredPrepRows: ApiPrep[];
  donePrepRows: ApiPrep[];
  readyPreps: Prep[];
  preppingPreps: Prep[];
  archivedPreps: Prep[];
  starredPreps: Prep[];
  donePreps: Prep[];
  archivePrep: (id: string) => Promise<void>;
  unarchivePrep: (id: string) => Promise<void>;
  retryPrep: (id: string) => Promise<void>;
  deletePrep: (id: string) => Promise<void>;
  /** Bulk hub actions — one toast, no per-item undo (used from multi-select). */
  bulkArchivePreps: (ids: string[]) => Promise<void>;
  bulkUnarchivePreps: (ids: string[]) => Promise<void>;
  bulkDeletePreps: (ids: string[]) => Promise<void>;
  setStarPrep: (id: string, starred: boolean) => Promise<void>;
  /** Mark ready prep done (Done tab) or move back to Inbox. */
  setPrepDone: (id: string, done: boolean) => Promise<void>;
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
  /** Call when user opens a ready prep — marks read in hub immediately (survives refresh/list races until server confirms). */
  markPrepOpenedOptimistic: (id: string) => void;
  /** Ready preps not yet opened (Inbox) — uses effective `opened_at` including optimistic. */
  unreadReadyCount: number;
  refresh: (opts?: PrepHubRefreshOptions) => Promise<void>;
  loadMore: (tab: "ready" | "prepping" | "archived" | "starred" | "done") => Promise<void>;
  hasMore: {
    ready: boolean;
    prepping: boolean;
    archived: boolean;
    starred: boolean;
    done: boolean;
  };
  loadingMore: {
    ready: boolean;
    prepping: boolean;
    archived: boolean;
    starred: boolean;
    done: boolean;
  };
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

type TabKey = "ready" | "prepping" | "archived" | "starred" | "done";

const CACHE_VERSION = 9;

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
  const [starredPrepRows, setStarredPrepRows] = useState<ApiPrep[]>([]);
  const [donePrepRows, setDonePrepRows] = useState<ApiPrep[]>([]);
  const [cursors, setCursors] = useState<{
    ready: string | null;
    prepping: string | null;
    archived: string | null;
    starred: string | null;
    done: string | null;
  }>({ ready: null, prepping: null, archived: null, starred: null, done: null });
  const [loadingMore, setLoadingMore] = useState({
    ready: false,
    prepping: false,
    archived: false,
    starred: false,
    done: false,
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

  /** Local `opened_at` timestamps until PATCH /opened lands — avoids unread flicker when refresh races the API. */
  const sessionOpenedAtRef = useRef<Record<string, string>>({});
  const [sessionOpenedVersion, setSessionOpenedVersion] = useState(0);

  const bumpOpenedSession = useCallback(() => {
    setSessionOpenedVersion((v) => v + 1);
  }, []);

  const mergeOpenedRow = useCallback((row: ApiPrep): ApiPrep => {
    const ts = sessionOpenedAtRef.current[row.id];
    if (
      (row.status === "ready" || row.status === "done") &&
      ts &&
      (row.opened_at === null || row.opened_at === undefined)
    ) {
      return { ...row, opened_at: ts };
    }
    return row;
  }, []);

  const markPrepOpenedOptimistic = useCallback(
    (id: string) => {
      if (sessionOpenedAtRef.current[id]) return;
      sessionOpenedAtRef.current[id] = new Date().toISOString();
      bumpOpenedSession();
    },
    [bumpOpenedSession],
  );

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
    if (row.opened_at) {
      delete sessionOpenedAtRef.current[row.id];
      bumpOpenedSession();
    }
    setReadyPrepRows((prev) => {
      const rest = prev.filter((x) => x.id !== row.id);
      if (row.status === "ready") {
        return sortPrepsByCreatedAtDesc([...rest, row]);
      }
      return rest;
    });
    setDonePrepRows((prev) => {
      const rest = prev.filter((x) => x.id !== row.id);
      if (row.status === "done") {
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
    setStarredPrepRows((prev) => {
      const rest = prev.filter((x) => x.id !== row.id);
      if (row.starred_at) {
        return sortPrepsByCreatedAtDesc([...rest, row]);
      }
      return rest;
    });
  }, [bumpOpenedSession]);

  const refresh = useCallback(async (opts?: PrepHubRefreshOptions) => {
    if (!isSignedIn) {
      sessionOpenedAtRef.current = {};
      setSessionOpenedVersion((v) => v + 1);
      setReadyPrepRows([]);
      setPreppingPrepRows([]);
      setArchivedPrepRows([]);
      setStarredPrepRows([]);
      setDonePrepRows([]);
      setPrepCounts(null);
      setCursors({ ready: null, prepping: null, archived: null, starred: null, done: null });
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
              starred?: ApiPrep[];
              done?: ApiPrep[];
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
              setStarredPrepRows(dedupePrepsById(parsed.starred ?? []));
              setDonePrepRows(dedupePrepsById(parsed.done ?? []));
              setLoading(false);
            }
          } catch {
            /* ignore */
          }
        }
      }
      const [r, p, a, st, d] = await Promise.all([
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
        listPrepsPage(getTokenRef.current, {
          starredOnly: true,
          limit: PREP_PAGE_SIZE,
        }),
        listPrepsPage(getTokenRef.current, {
          status: "done",
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
      setStarredPrepRows(dedupePrepsById(st.items));
      setDonePrepRows(dedupePrepsById(d.items));
      setCursors({
        ready: r.next_cursor,
        prepping: p.next_cursor,
        archived: a.next_cursor,
        starred: st.next_cursor,
        done: d.next_cursor,
      });
      if (key) {
        await AsyncStorage.setItem(
          key,
          JSON.stringify({
            v: CACHE_VERSION,
            ready: r.items,
            prepping: p.items,
            archived: a.items,
            starred: st.items,
            done: d.items,
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
      if (tab === "starred") {
        const res = await listPrepsPage(getTokenRef.current, {
          starredOnly: true,
          limit: PREP_PAGE_SIZE,
          cursor,
        });
        setStarredPrepRows((prev) =>
          dedupePrepsById([...prev, ...res.items.map((x) => mergeOpenedRow(x))]),
        );
        setCursors((c) => ({ ...c, starred: res.next_cursor }));
        return;
      }
      const status =
        tab === "archived"
          ? "archived"
          : tab === "ready"
            ? "ready"
            : tab === "done"
              ? "done"
              : "prepping";
      const res = await listPrepsPage(getTokenRef.current, {
        status,
        limit: PREP_PAGE_SIZE,
        cursor,
      });
      if (tab === "ready") {
        setReadyPrepRows((prev) =>
          dedupePrepsById([...prev, ...res.items.map((x) => mergeOpenedRow(x))]),
        );
      } else if (tab === "prepping") {
        setPreppingPrepRows((prev) => dedupePrepsById([...prev, ...res.items]));
      } else if (tab === "done") {
        setDonePrepRows((prev) =>
          dedupePrepsById([...prev, ...res.items.map((x) => mergeOpenedRow(x))]),
        );
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
  }, [cursors, mergeOpenedRow]);

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

  const readyPrepRowsEffective = useMemo(
    () => readyPrepRows.map(mergeOpenedRow),
    [readyPrepRows, mergeOpenedRow, sessionOpenedVersion],
  );

  const unreadReadyCount = useMemo(
    () =>
      readyPrepRowsEffective.filter(
        (r) =>
          r.status === "ready" && (r.opened_at === null || r.opened_at === undefined),
      ).length,
    [readyPrepRowsEffective],
  );

  const readyPreps = useMemo(
    () => readyPrepRowsEffective.map(apiPrepToPrep),
    [readyPrepRowsEffective],
  );

  const preppingPreps = useMemo(
    () => preppingPrepRows.map((r) => apiPrepToPrep(mergeOpenedRow(r))),
    [preppingPrepRows, mergeOpenedRow, sessionOpenedVersion],
  );

  const archivedPreps = useMemo(
    () => archivedPrepRows.map((r) => apiPrepToPrep(mergeOpenedRow(r))),
    [archivedPrepRows, mergeOpenedRow, sessionOpenedVersion],
  );

  const starredPreps = useMemo(
    () => starredPrepRows.map((r) => apiPrepToPrep(mergeOpenedRow(r))),
    [starredPrepRows, mergeOpenedRow, sessionOpenedVersion],
  );

  const donePreps = useMemo(
    () => donePrepRows.map((r) => apiPrepToPrep(mergeOpenedRow(r))),
    [donePrepRows, mergeOpenedRow, sessionOpenedVersion],
  );

  const hasMore = useMemo(
    () => ({
      ready: Boolean(cursors.ready),
      prepping: Boolean(cursors.prepping),
      archived: Boolean(cursors.archived),
      starred: Boolean(cursors.starred),
      done: Boolean(cursors.done),
    }),
    [cursors],
  );

  const getPrep = useCallback(
    (id: string) => {
      const r = [
        ...readyPrepRows,
        ...donePrepRows,
        ...preppingPrepRows,
        ...archivedPrepRows,
        ...starredPrepRows,
      ].find((p) => p.id === id);
      return r ? apiPrepToPrep(mergeOpenedRow(r)) : undefined;
    },
    [
      readyPrepRows,
      donePrepRows,
      preppingPrepRows,
      archivedPrepRows,
      starredPrepRows,
      mergeOpenedRow,
      sessionOpenedVersion,
    ],
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

  const removeIdsFromAllLists = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    setReadyPrepRows((prev) => prev.filter((x) => !idSet.has(x.id)));
    setDonePrepRows((prev) => prev.filter((x) => !idSet.has(x.id)));
    setPreppingPrepRows((prev) => prev.filter((x) => !idSet.has(x.id)));
    setArchivedPrepRows((prev) => prev.filter((x) => !idSet.has(x.id)));
    setStarredPrepRows((prev) => prev.filter((x) => !idSet.has(x.id)));
  }, []);

  const removeIdFromAllLists = useCallback(
    (id: string) => {
      removeIdsFromAllLists([id]);
    },
    [removeIdsFromAllLists],
  );

  const restoreSnapshotFromApiPrep = useCallback((snapshot: ApiPrep) => {
    const id = snapshot.id;
    setReadyPrepRows((prev) => prev.filter((x) => x.id !== id));
    setDonePrepRows((prev) => prev.filter((x) => x.id !== id));
    setPreppingPrepRows((prev) => prev.filter((x) => x.id !== id));
    setArchivedPrepRows((prev) => prev.filter((x) => x.id !== id));
    setStarredPrepRows((prev) => prev.filter((x) => x.id !== id));
    if (snapshot.status === "ready") {
      setReadyPrepRows((prev) => sortPrepsByCreatedAtDesc([...prev, snapshot]));
    } else if (snapshot.status === "done") {
      setDonePrepRows((prev) => sortPrepsByCreatedAtDesc([...prev, snapshot]));
    } else if (snapshot.status === "prepping" || snapshot.status === "failed") {
      setPreppingPrepRows((prev) => sortPrepsByCreatedAtDesc([...prev, snapshot]));
    } else if (snapshot.status === "archived") {
      setArchivedPrepRows((prev) => sortPrepsByCreatedAtDesc([...prev, snapshot]));
    }
    if (snapshot.starred_at) {
      setStarredPrepRows((prev) => sortPrepsByCreatedAtDesc([...prev.filter((x) => x.id !== id), snapshot]));
    }
  }, []);

  const findPrepRow = useCallback(
    (id: string): ApiPrep | undefined =>
      readyPrepRows.find((x) => x.id === id) ??
      donePrepRows.find((x) => x.id === id) ??
      preppingPrepRows.find((x) => x.id === id) ??
      archivedPrepRows.find((x) => x.id === id) ??
      starredPrepRows.find((x) => x.id === id),
    [readyPrepRows, donePrepRows, preppingPrepRows, archivedPrepRows, starredPrepRows],
  );

  const bumpPrepCountsForArchive = useCallback((row: ApiPrep) => {
    setPrepCounts((c) => {
      if (!c) return c;
      const d = c.done ?? 0;
      if (row.status === "ready") {
        return {
          ...c,
          ready: Math.max(0, c.ready - 1),
          archived: c.archived + 1,
        };
      }
      if (row.status === "done") {
        return {
          ...c,
          done: Math.max(0, d - 1),
          archived: c.archived + 1,
        };
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
      const d = c.done ?? 0;
      if (snapshot.status === "ready") {
        return {
          ...c,
          ready: c.ready + 1,
          archived: Math.max(0, c.archived - 1),
        };
      }
      if (snapshot.status === "done") {
        return {
          ...c,
          done: d + 1,
          archived: Math.max(0, c.archived - 1),
        };
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
      const starN = typeof c.starred === "number" ? c.starred : 0;
      const withStar =
        row.starred_at && typeof c.starred === "number"
          ? { ...c, starred: Math.max(0, starN - 1) }
          : c;
      const d = c.done ?? 0;
      if (row.status === "ready") {
        return {
          ...withStar,
          ready: Math.max(0, withStar.ready - 1),
        };
      }
      if (row.status === "done") {
        return {
          ...withStar,
          done: Math.max(0, d - 1),
        };
      }
      if (row.status === "prepping" || row.status === "failed") {
        return { ...withStar, preparing: Math.max(0, c.preparing - 1) };
      }
      if (row.status === "archived") return { ...withStar, archived: Math.max(0, c.archived - 1) };
      return withStar;
    });
  }, []);

  const bumpPrepCountsRevertDelete = useCallback((snapshot: ApiPrep) => {
    setPrepCounts((c) => {
      if (!c) return c;
      const starN = typeof c.starred === "number" ? c.starred : 0;
      const withStar = snapshot.starred_at ? { ...c, starred: starN + 1 } : c;
      const d = c.done ?? 0;
      if (snapshot.status === "ready") {
        return {
          ...withStar,
          ready: withStar.ready + 1,
        };
      }
      if (snapshot.status === "done") {
        return {
          ...withStar,
          done: d + 1,
        };
      }
      if (snapshot.status === "prepping" || snapshot.status === "failed") {
        return { ...withStar, preparing: c.preparing + 1 };
      }
      if (snapshot.status === "archived") return { ...withStar, archived: c.archived + 1 };
      return withStar;
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
        done_at: null,
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
      const readyRow: ApiPrep = { ...row, status: "ready", archived_at: null, done_at: null };
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

      showHubToast("Restored to Inbox", undo);

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
      // No LayoutAnimation here — Android + FlatList + RNGH Swipeable unmount has crashed the process.
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

  const setStarPrep = useCallback(
    async (id: string, starred: boolean) => {
      const row = findPrepRow(id);
      if (!row) return;
      const optimistic: ApiPrep = {
        ...row,
        starred_at: starred ? new Date().toISOString() : null,
      };
      setPrepCounts((c) => {
        if (!c) return c;
        const starN = typeof c.starred === "number" ? c.starred : 0;
        const was = Boolean(row.starred_at);
        if (starred && !was) return { ...c, starred: starN + 1 };
        if (!starred && was) return { ...c, starred: Math.max(0, starN - 1) };
        return c;
      });
      upsertPrepRow(optimistic);
      try {
        const server = await starPrepApi(getTokenRef.current, id, starred);
        upsertPrepRow(server);
      } catch {
        await refresh();
      }
    },
    [findPrepRow, upsertPrepRow, refresh],
  );

  const setPrepDone = useCallback(
    async (id: string, done: boolean) => {
      const row = findPrepRow(id);
      if (!row || (row.status !== "ready" && row.status !== "done")) return;
      const snapshot = { ...row };
      const token = bumpHubOpToken(id);
      applyHubLayoutAnimation();
      const ts = new Date().toISOString();
      const next: ApiPrep = {
        ...row,
        status: done ? "done" : "ready",
        done_at: done ? ts : null,
      };
      removeIdsFromAllLists(id);
      if (done) {
        setDonePrepRows((prev) =>
          sortPrepsByCreatedAtDesc([...prev.filter((x) => x.id !== id), next]),
        );
      } else {
        setReadyPrepRows((prev) =>
          sortPrepsByCreatedAtDesc([...prev.filter((x) => x.id !== id), next]),
        );
      }
      if (next.starred_at) {
        setStarredPrepRows((prev) =>
          sortPrepsByCreatedAtDesc([...prev.filter((x) => x.id !== id), next]),
        );
      }
      setPrepCounts((c) => {
        if (!c) return c;
        const d = c.done ?? 0;
        if (done && snapshot.status === "ready") {
          return { ...c, ready: Math.max(0, c.ready - 1), done: d + 1 };
        }
        if (!done && snapshot.status === "done") {
          return { ...c, ready: c.ready + 1, done: Math.max(0, d - 1) };
        }
        return c;
      });

      try {
        const serverRow = await setPrepDoneApi(getTokenRef.current, id, done);
        if (readHubOpToken(id) !== token) return;
        upsertPrepRow(serverRow);
        syncCountsFromServer();
      } catch (e) {
        if (readHubOpToken(id) !== token) return;
        bumpHubOpToken(id);
        applyHubLayoutAnimation();
        restoreSnapshotFromApiPrep(snapshot);
        setPrepCounts((c) => {
          if (!c) return c;
          const d = c.done ?? 0;
          if (done && snapshot.status === "ready") {
            return { ...c, ready: c.ready + 1, done: Math.max(0, d - 1) };
          }
          if (!done && snapshot.status === "done") {
            return { ...c, ready: Math.max(0, c.ready - 1), done: d + 1 };
          }
          return c;
        });
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        showHubToast("Couldn’t update. Try again.");
        throw e;
      }
    },
    [
      findPrepRow,
      bumpHubOpToken,
      readHubOpToken,
      removeIdsFromAllLists,
      restoreSnapshotFromApiPrep,
      upsertPrepRow,
      syncCountsFromServer,
      showHubToast,
    ],
  );

  const bulkArchivePreps = useCallback(
    async (ids: string[]) => {
      const unique = [...new Set(ids)].filter(Boolean);
      if (unique.length === 0) return;
      const rows: ApiPrep[] = [];
      for (const id of unique) {
        const row = findPrepRow(id);
        if (row && row.status !== "archived") rows.push(row);
      }
      if (rows.length === 0) return;
      dismissHubToast();
      applyHubLayoutAnimation();
      const idSet = new Set(rows.map((r) => r.id));
      removeIdsFromAllLists(Array.from(idSet));
      setArchivedPrepRows((prev) => {
        const filtered = prev.filter((x) => !idSet.has(x.id));
        const archived = rows.map((row) => ({
          ...row,
          status: "archived" as const,
          archived_at: new Date().toISOString(),
          done_at: null,
        }));
        return sortPrepsByCreatedAtDesc([...filtered, ...archived]);
      });
      for (const row of rows) bumpPrepCountsForArchive(row);
      const n = rows.length;
      showHubToast(`Archived ${n} ${n === 1 ? "prep" : "preps"}`);
      try {
        await Promise.all(rows.map((r) => archivePrepApi(getTokenRef.current, r.id)));
        syncCountsFromServer();
      } catch {
        await refresh();
        setError("Couldn’t archive all preps.");
        showHubToast("Couldn’t archive all preps.");
      }
    },
    [
      findPrepRow,
      removeIdsFromAllLists,
      bumpPrepCountsForArchive,
      dismissHubToast,
      showHubToast,
      syncCountsFromServer,
      refresh,
    ],
  );

  const bulkUnarchivePreps = useCallback(
    async (ids: string[]) => {
      const unique = [...new Set(ids)].filter(Boolean);
      if (unique.length === 0) return;
      const rows: ApiPrep[] = [];
      for (const id of unique) {
        const row = findPrepRow(id);
        if (row?.status === "archived") rows.push(row);
      }
      if (rows.length === 0) return;
      dismissHubToast();
      applyHubLayoutAnimation();
      const idSet = new Set(rows.map((r) => r.id));
      removeIdsFromAllLists(Array.from(idSet));
      setReadyPrepRows((prev) => {
        const filtered = prev.filter((x) => !idSet.has(x.id));
        const ready = rows.map((row) => ({
          ...row,
          status: "ready" as const,
          archived_at: null,
          done_at: null,
        }));
        return sortPrepsByCreatedAtDesc([...filtered, ...ready]);
      });
      for (let i = 0; i < rows.length; i++) bumpPrepCountsForUnarchive();
      const n = rows.length;
      showHubToast(`Restored ${n} ${n === 1 ? "prep" : "preps"} to Inbox`);
      try {
        await Promise.all(rows.map((r) => unarchivePrepApi(getTokenRef.current, r.id)));
        syncCountsFromServer();
      } catch {
        await refresh();
        setError("Couldn’t restore all preps.");
        showHubToast("Couldn’t restore all preps.");
      }
    },
    [
      findPrepRow,
      removeIdsFromAllLists,
      bumpPrepCountsForUnarchive,
      dismissHubToast,
      showHubToast,
      syncCountsFromServer,
      refresh,
    ],
  );

  const bulkDeletePreps = useCallback(
    async (ids: string[]) => {
      const unique = [...new Set(ids)].filter(Boolean);
      if (unique.length === 0) return;
      const rows: ApiPrep[] = [];
      for (const id of unique) {
        const row = findPrepRow(id);
        if (row) rows.push(row);
      }
      if (rows.length === 0) return;
      dismissHubToast();
      const idSet = new Set(rows.map((r) => r.id));
      removeIdsFromAllLists(Array.from(idSet));
      for (const row of rows) bumpPrepCountsForDelete(row);
      const n = rows.length;
      showHubToast(`Deleted ${n} ${n === 1 ? "prep" : "preps"}`);
      try {
        await Promise.all(rows.map((r) => deletePrepApi(getTokenRef.current, r.id)));
        syncCountsFromServer();
      } catch {
        await refresh();
        setError("Couldn’t delete all preps.");
        showHubToast("Couldn’t delete all preps.");
      }
    },
    [
      findPrepRow,
      removeIdsFromAllLists,
      bumpPrepCountsForDelete,
      dismissHubToast,
      showHubToast,
      syncCountsFromServer,
      refresh,
    ],
  );

  const value = useMemo(
    () => ({
      readyPrepRows,
      readyPrepRowsEffective,
      preppingPrepRows,
      archivedPrepRows,
      starredPrepRows,
      donePrepRows,
      readyPreps,
      preppingPreps,
      archivedPreps,
      starredPreps,
      donePreps,
      archivePrep,
      unarchivePrep,
      retryPrep,
      deletePrep,
      bulkArchivePreps,
      bulkUnarchivePreps,
      bulkDeletePreps,
      setStarPrep,
      setPrepDone,
      scheduleHomeNavigationIntent,
      consumeHomeNavigationIntent,
      hubToast,
      showHubToast,
      dismissHubToast,
      getPrep,
      fetchPrepById,
      upsertPrepRow,
      markPrepOpenedOptimistic,
      unreadReadyCount,
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
      readyPrepRowsEffective,
      preppingPrepRows,
      archivedPrepRows,
      starredPrepRows,
      donePrepRows,
      readyPreps,
      preppingPreps,
      archivedPreps,
      starredPreps,
      donePreps,
      archivePrep,
      unarchivePrep,
      retryPrep,
      deletePrep,
      bulkArchivePreps,
      bulkUnarchivePreps,
      bulkDeletePreps,
      setStarPrep,
      setPrepDone,
      scheduleHomeNavigationIntent,
      consumeHomeNavigationIntent,
      hubToast,
      showHubToast,
      dismissHubToast,
      getPrep,
      fetchPrepById,
      upsertPrepRow,
      markPrepOpenedOptimistic,
      unreadReadyCount,
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
