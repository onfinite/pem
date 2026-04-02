import type { Prep } from "@/components/sections/home-sections/homePrepData";
import {
  apiPrepToPrep,
  archivePrepApi,
  getPrepById,
  listPreps,
  type ApiPrep,
} from "@/lib/pemApi";
import { useAuth } from "@clerk/expo";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AppState, type AppStateStatus } from "react-native";

type PrepHubContextValue = {
  readyPreps: Prep[];
  preppingPreps: Prep[];
  archivedPreps: Prep[];
  archivePrep: (id: string) => Promise<void>;
  getPrep: (id: string) => Prep | undefined;
  fetchPrepById: (id: string) => Promise<Prep | null>;
  refresh: () => Promise<void>;
  loading: boolean;
  error: string | null;
};

const PrepHubContext = createContext<PrepHubContextValue | null>(null);

const POLL_MS_IDLE = 12_000;
const POLL_MS_ACTIVE = 2_500;

export function PrepHubProvider({ children }: { children: ReactNode }) {
  const { getToken, isSignedIn } = useAuth();
  const [rows, setRows] = useState<ApiPrep[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isSignedIn) {
      setRows([]);
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const data = await listPreps(getToken);
      setRows(data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [getToken, isSignedIn]);

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

  const hasPrepping = useMemo(() => rows.some((r) => r.status === "prepping"), [rows]);

  useEffect(() => {
    if (!isSignedIn) return;
    const ms = hasPrepping ? POLL_MS_ACTIVE : POLL_MS_IDLE;
    const id = setInterval(() => void refresh(), ms);
    return () => clearInterval(id);
  }, [isSignedIn, refresh, hasPrepping]);

  const readyPreps = useMemo(
    () => rows.filter((r) => r.status === "ready").map(apiPrepToPrep),
    [rows],
  );

  const preppingPreps = useMemo(
    () => rows.filter((r) => r.status === "prepping").map(apiPrepToPrep),
    [rows],
  );

  const archivedPreps = useMemo(
    () => rows.filter((r) => r.status === "archived").map(apiPrepToPrep),
    [rows],
  );

  const getPrep = useCallback(
    (id: string) => {
      const r = rows.find((p) => p.id === id);
      return r ? apiPrepToPrep(r) : undefined;
    },
    [rows],
  );

  const fetchPrepById = useCallback(
    async (id: string) => {
      try {
        const r = await getPrepById(getToken, id);
        setRows((prev) => {
          const rest = prev.filter((p) => p.id !== r.id);
          return [...rest, r];
        });
        return apiPrepToPrep(r);
      } catch {
        return null;
      }
    },
    [getToken],
  );

  const archivePrep = useCallback(
    async (id: string) => {
      await archivePrepApi(getToken, id);
      await refresh();
    },
    [getToken, refresh],
  );

  const value = useMemo(
    () => ({
      readyPreps,
      preppingPreps,
      archivedPreps,
      archivePrep,
      getPrep,
      fetchPrepById,
      refresh,
      loading,
      error,
    }),
    [
      readyPreps,
      preppingPreps,
      archivedPreps,
      archivePrep,
      getPrep,
      fetchPrepById,
      refresh,
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
