import { useAuth } from "@clerk/expo";
import { useCallback, useState } from "react";
import {
  type ApiList,
  createList,
  deleteList,
  fetchLists,
} from "@/lib/pemApi";

export function useLists() {
  const { getToken } = useAuth();
  const [lists, setLists] = useState<ApiList[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadLists = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetchLists(getToken);
      setLists(res.items);
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
      await deleteList(getToken, id);
      await loadLists();
    },
    [getToken, loadLists],
  );

  return { lists, isLoading, loadLists, addList, removeList } as const;
}
