import {
  ARCHIVED_SEED_PREPS,
  SAMPLE_READY_PREPS,
  getPrepById,
  type Prep,
} from "@/components/sections/home-sections/homePrepData";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type PrepHubContextValue = {
  readyPreps: Prep[];
  archivedPreps: Prep[];
  archivePrep: (id: string) => void;
  getPrep: (id: string) => Prep | undefined;
};

const PrepHubContext = createContext<PrepHubContextValue | null>(null);

export function PrepHubProvider({ children }: { children: ReactNode }) {
  const [archivedFromReady, setArchivedFromReady] = useState<Set<string>>(() => new Set());

  const readyPreps = useMemo(
    () => SAMPLE_READY_PREPS.filter((p) => !archivedFromReady.has(p.id)),
    [archivedFromReady],
  );

  const archivedPreps = useMemo(
    () => [
      ...ARCHIVED_SEED_PREPS,
      ...SAMPLE_READY_PREPS.filter((p) => archivedFromReady.has(p.id)),
    ],
    [archivedFromReady],
  );

  const archivePrep = useCallback((id: string) => {
    setArchivedFromReady((prev) => new Set(prev).add(id));
  }, []);

  const getPrep = useCallback((id: string) => getPrepById(id), []);

  const value = useMemo(
    () => ({ readyPreps, archivedPreps, archivePrep, getPrep }),
    [readyPreps, archivedPreps, archivePrep, getPrep],
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
