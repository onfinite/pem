import LocationPermissionSheet from "@/components/location/LocationPermissionSheet";
import { usePrepHub } from "@/contexts/PrepHubContext";
import { postPrepClientHints } from "@/lib/pemApi";
import { isLocationSensitiveIntent } from "@/lib/locationIntent";
import { useAuth } from "@clerk/expo";
import * as Location from "expo-location";
import { PermissionStatus } from "expo-location";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

const SHEET_COPY = {
  title: "Location for this prep",
  bodyPrimary: "Pem needs your location to find places near you.",
  bodySecondary:
    "We use it for this prep in the foreground only—not in the background, and we don’t save coordinates to your profile.",
} as const;

/**
 * When a location-sensitive prep is preparing:
 * - **OS already granted** → get position and POST coords (no sheet; no repeat explainer).
 * - **OS denied / can’t ask again** → POST unavailable silently (no sheet; per pem-location-permission).
 * - **Undetermined** → Pem sheet first, then system dialog on Allow; Not now → unavailable for this prep.
 */
export default function LocationPrepCoordinator() {
  const { getToken } = useAuth();
  const { preppingPrepRows } = usePrepHub();
  const handledRef = useRef<Set<string>>(new Set());
  const [sheetPrepId, setSheetPrepId] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS === "web") return;
    if (sheetPrepId) return;

    const next = preppingPrepRows.find(
      (r) =>
        r.status === "prepping" &&
        isLocationSensitiveIntent(r.intent) &&
        !handledRef.current.has(r.id),
    );
    if (!next) return;

    const prepId = next.id;
    handledRef.current.add(prepId);

    void (async () => {
      try {
        const perm = await Location.getForegroundPermissionsAsync();

        if (perm.granted) {
          try {
            const pos = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
            await postPrepClientHints(getToken, prepId, {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            });
          } catch {
            await postPrepClientHints(getToken, prepId, {
              locationUnavailable: true,
            });
          }
          return;
        }

        if (perm.status === PermissionStatus.DENIED || perm.canAskAgain === false) {
          await postPrepClientHints(getToken, prepId, { locationUnavailable: true });
          return;
        }

        setSheetPrepId(prepId);
      } catch {
        try {
          await postPrepClientHints(getToken, prepId, { locationUnavailable: true });
        } catch {
          /* ignore */
        }
      }
    })();
  }, [preppingPrepRows, sheetPrepId, getToken]);

  useEffect(() => {
    if (!sheetPrepId) return;
    const stillPrepping = preppingPrepRows.some((r) => r.id === sheetPrepId);
    if (!stillPrepping) {
      setSheetPrepId(null);
    }
  }, [preppingPrepRows, sheetPrepId]);

  const submitUnavailable = useCallback(async () => {
    const id = sheetPrepId;
    if (!id) return;
    try {
      await postPrepClientHints(getToken, id, { locationUnavailable: true });
    } catch {
      /* non-fatal — worker degrades without hint */
    }
    setSheetPrepId(null);
  }, [getToken, sheetPrepId]);

  const onAllow = useCallback(async () => {
    if (Platform.OS === "web") return;
    const id = sheetPrepId;
    if (!id) return;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== PermissionStatus.GRANTED) {
        try {
          await postPrepClientHints(getToken, id, { locationUnavailable: true });
        } catch {
          /* ignore */
        }
        setSheetPrepId(null);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      try {
        await postPrepClientHints(getToken, id, {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
      } catch {
        /* ignore */
      }
      setSheetPrepId(null);
    } catch {
      try {
        await postPrepClientHints(getToken, id, { locationUnavailable: true });
      } catch {
        /* ignore */
      }
      setSheetPrepId(null);
    }
  }, [getToken, sheetPrepId]);

  if (Platform.OS === "web") {
    return null;
  }

  return (
    <LocationPermissionSheet
      visible={sheetPrepId !== null}
      title={SHEET_COPY.title}
      bodyPrimary={SHEET_COPY.bodyPrimary}
      bodySecondary={SHEET_COPY.bodySecondary}
      onNotNow={submitUnavailable}
      onAllow={onAllow}
    />
  );
}
