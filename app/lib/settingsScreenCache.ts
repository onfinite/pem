import AsyncStorage from "@react-native-async-storage/async-storage";

import type { CalendarConnection } from "@/lib/pemApi";

const storageKey = (userId: string) => `@pem/settings_screen_v1:${userId}`;

export type SettingsScreenCache = {
  summary: string | null;
  notification_time: string;
  connections: CalendarConnection[];
};

const emptySnapshot: SettingsScreenCache = {
  summary: null,
  notification_time: "07:00",
  connections: [],
};

export async function readSettingsScreenCache(
  userId: string | null | undefined,
): Promise<SettingsScreenCache | null> {
  if (!userId) return null;
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<SettingsScreenCache>;
    return {
      summary: o.summary ?? null,
      notification_time:
        typeof o.notification_time === "string" ? o.notification_time : "07:00",
      connections: Array.isArray(o.connections) ? o.connections : [],
    };
  } catch {
    return null;
  }
}

export async function mergeSettingsScreenCache(
  userId: string,
  patch: Partial<SettingsScreenCache>,
): Promise<void> {
  try {
    const prev = (await readSettingsScreenCache(userId)) ?? emptySnapshot;
    await AsyncStorage.setItem(
      storageKey(userId),
      JSON.stringify({ ...prev, ...patch }),
    );
  } catch {
    /* non-critical */
  }
}
