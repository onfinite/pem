import { patchTimezone } from "@/lib/pemApi";
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

async function syncIfChanged(getToken: () => Promise<string | null>) {
  try {
    const tz = deviceTimeZone();
    const last = await AsyncStorage.getItem(TZ_STORAGE_KEY);
    if (last === tz) return;
    await patchTimezone(getToken, tz);
    await AsyncStorage.setItem(TZ_STORAGE_KEY, tz);
  } catch {
    /* non-fatal */
  }
}

export default function TimezoneRegistrar() {
  const { isSignedIn, getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const ran = useRef(false);

  useEffect(() => {
    if (!isSignedIn) return;
    if (!ran.current) {
      ran.current = true;
      syncIfChanged(getTokenRef.current);
    }

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        syncIfChanged(getTokenRef.current);
      }
    });
    return () => sub.remove();
  }, [isSignedIn]);

  return null;
}
