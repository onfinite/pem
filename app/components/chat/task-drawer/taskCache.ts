import type { ApiExtract } from "@/lib/pemApi";
import AsyncStorage from "@react-native-async-storage/async-storage";

const OPEN_KEY = "@pem/tasks_open_v1";
const DONE_KEY = "@pem/tasks_done_v1";
const CACHE_LIMIT = 200;

export async function readOpenCache(): Promise<ApiExtract[]> {
  try {
    const raw = await AsyncStorage.getItem(OPEN_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function writeOpenCache(items: ApiExtract[]): Promise<void> {
  try {
    await AsyncStorage.setItem(
      OPEN_KEY,
      JSON.stringify(items.slice(0, CACHE_LIMIT)),
    );
  } catch {
    // non-critical
  }
}

export async function readDoneCache(): Promise<ApiExtract[]> {
  try {
    const raw = await AsyncStorage.getItem(DONE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function writeDoneCache(items: ApiExtract[]): Promise<void> {
  try {
    await AsyncStorage.setItem(
      DONE_KEY,
      JSON.stringify(items.slice(0, CACHE_LIMIT)),
    );
  } catch {
    // non-critical
  }
}
