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
      const now = new Date().toISOString();
      const optimistic: ApiList = {
        id: `temp-${Date.now()}`,
        user_id: "",
        name,
        color: null,
        icon: null,
        is_default: false,
        sort_order: lists.length,
        open_count: 0,
        created_at: now,
        updated_at: now,
      };
      setLists((prev) => [...prev, optimistic]);
      try {
        await createList(getToken, { name });
      } finally {
        await loadLists();
      }
    },
    [getToken, loadLists, lists.length],
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
