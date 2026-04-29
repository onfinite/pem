import { useAuth } from "@clerk/expo";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type ApiList,
  createList,
  deleteList,
  fetchLists,
} from "@/lib/pemApi";
import {
  readListsCache,
  writeListsCache,
} from "@/components/inbox/task-drawer/listCache";

export function useLists() {
  const { getToken } = useAuth();
  const [lists, setLists] = useState<ApiList[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const didHydrate = useRef(false);
  const listFetchGen = useRef(0);

  useEffect(() => {
    if (didHydrate.current) return;
    didHydrate.current = true;
    readListsCache().then((cached) => {
      if (cached.length > 0) setLists(cached);
    });
  }, []);

  const loadLists = useCallback(async () => {
    const gen = ++listFetchGen.current;
    setIsLoading(true);
    try {
      const res = await fetchLists(getToken);
      if (gen !== listFetchGen.current) return;
      setLists(res.items);
      writeListsCache(res.items);
    } catch {
      if (gen !== listFetchGen.current) return;
    } finally {
      if (gen === listFetchGen.current) setIsLoading(false);
    }
  }, [getToken]);

  const addList = useCallback(
    async (name: string) => {
      const tempId = `temp-${Date.now()}`;
      setLists((prev) => {
        const optimistic: ApiList = {
          id: tempId,
          user_id: "",
          name,
          color: null,
          icon: null,
          is_default: false,
          sort_order: prev.length,
          open_count: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        return [...prev, optimistic];
      });
      try {
        const { item } = await createList(getToken, { name });
        setLists((prev) => prev.map((l) => (l.id === tempId ? item : l)));
      } catch (err) {
        setLists((prev) => prev.filter((l) => l.id !== tempId));
        throw err;
      } finally {
        await loadLists();
      }
    },
    [getToken, loadLists],
  );

  const removeList = useCallback(
    async (id: string) => {
      setLists((prev) => prev.filter((l) => l.id !== id));
      try {
        await deleteList(getToken, id);
        setLists((prev) => {
          void writeListsCache(prev);
          return prev;
        });
      } catch {
        await loadLists();
      }
    },
    [getToken, loadLists],
  );

  return { lists, isLoading, loadLists, addList, removeList } as const;
}
