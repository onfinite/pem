import { useAuth } from "@clerk/expo";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type ApiList,
  createList,
  deleteList,
  fetchLists,
} from "@/lib/pemApi";
import { readListsCache, writeListsCache } from "@/components/chat/task-drawer/listCache";

export function useLists() {
  const { getToken } = useAuth();
  const [lists, setLists] = useState<ApiList[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const didHydrate = useRef(false);

  useEffect(() => {
    if (didHydrate.current) return;
    didHydrate.current = true;
    readListsCache().then((cached) => {
      if (cached.length > 0) setLists(cached);
    });
  }, []);

  const loadLists = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetchLists(getToken);
      setLists(res.items);
      writeListsCache(res.items);
    } catch {
      // keep stale list in state
    } finally {
      setIsLoading(false);
    }
  }, [getToken]);

  const addList = useCallback(
    async (name: string) => {
      await createList(getToken, { name });
      await loadLists();
    },
    [getToken, loadLists],
  );

  const removeList = useCallback(
    async (id: string) => {
      setLists((prev) => prev.filter((l) => l.id !== id));
      await deleteList(getToken, id);
      await loadLists();
    },
    [getToken, loadLists],
  );

  return { lists, isLoading, loadLists, addList, removeList } as const;
}
