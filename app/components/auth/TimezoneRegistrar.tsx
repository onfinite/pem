import { getMe, patchTimezone } from "@/services/api/pemApi";
import { useAuth } from "@clerk/expo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";

const TZ_STORAGE_KEY = "@pem/last_sent_tz";

function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  } catch {
    return "UTC";
  }
}

/**
 * Sync device IANA timezone to the server when missing or out of date.
 * We compare against GET /users/me — not only AsyncStorage — so a failed
 * PATCH (server down) or a reset DB does not leave the user stuck with
 * no timezone forever.
 */
async function syncIfChanged(getToken: () => Promise<string | null>) {
  const tz = deviceTimeZone();
  try {
    const me = await getMe(getToken);
    if (me.timezone === tz) {
      await AsyncStorage.setItem(TZ_STORAGE_KEY, tz);
      return;
    }
    await patchTimezone(getToken, tz);
    await AsyncStorage.setItem(TZ_STORAGE_KEY, tz);
  } catch {
    /* non-fatal — retry on next foreground */
  }
}

export default function TimezoneRegistrar() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    void syncIfChanged(getTokenRef.current);

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void syncIfChanged(getTokenRef.current);
      }
    });
    return () => sub.remove();
  }, [isLoaded, isSignedIn]);

  return null;
}
