import type { ApiList } from "@/services/api/pemApi";
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "@pem/lists_v1";

export async function readListsCache(): Promise<ApiList[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function writeListsCache(items: ApiList[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // non-critical
  }
}
