import { setUserPushToken } from "@/lib/pemApi";
import { useAuth } from "@clerk/expo";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";

/**
 * Registers the Expo push token with the API when the user is signed in, and routes
 * notification taps to `/prep/[id]` when `prep_id` is present (see backend `PushService`).
 */
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

function prepIdFromNotification(notification: Notifications.Notification): string | null {
  const data = notification.request.content.data as Record<string, unknown> | undefined;
  const raw = data?.prep_id;
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("default", {
    name: "Default",
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

function isExpoGo(): boolean {
  /** `expo` = running inside Expo Go; remote push is not supported there (SDK 53+ on Android, limited elsewhere). */
  return Constants.appOwnership === "expo";
}

async function obtainExpoPushToken(): Promise<string | null> {
  if (Platform.OS === "web") {
    if (__DEV__) {
      console.log("[pem push] skipped: web");
    }
    return null;
  }
  if (isExpoGo()) {
    if (__DEV__) {
      console.log(
        "[pem push] skipped: Expo Go — use a development build (EAS) for remote push tokens.",
      );
    }
    return null;
  }
  if (!Device.isDevice) {
    if (__DEV__) {
      console.log("[pem push] skipped: need a physical device (simulator has no push token)");
    }
    return null;
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId?.trim()) {
    if (__DEV__) {
      console.log(
        "[pem push] skipped: set expo.extra.eas.projectId in app config (run `eas init` / link an Expo project).",
      );
    }
    return null;
  }

  await ensureAndroidChannel();

  const { status: existing } = await Notifications.getPermissionsAsync();
  let next = existing;
  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    next = status;
  }
  if (next !== "granted") {
    if (__DEV__) {
      console.log("[pem push] skipped: notification permission not granted:", next);
    }
    return null;
  }

  try {
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return token.data;
  } catch (e) {
    if (__DEV__) {
      console.warn("[pem push] getExpoPushTokenAsync failed:", e);
    }
    return null;
  }
}

export default function PushNotificationRegistrar() {
  const { getToken, isSignedIn } = useAuth();
  const router = useRouter();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const lastSentTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isSignedIn) {
      lastSentTokenRef.current = null;
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const expoToken = await obtainExpoPushToken();
        if (cancelled || !expoToken) return;
        if (expoToken === lastSentTokenRef.current) return;
        await setUserPushToken(() => getTokenRef.current(), expoToken);
        lastSentTokenRef.current = expoToken;
        if (__DEV__) {
          console.log("[pem push] token saved to API — prep-ready notifications enabled");
        }
      } catch (e) {
        if (__DEV__) {
          console.warn("[pem push] PATCH /users/me/push-token failed:", e);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isSignedIn]);

  useEffect(() => {
    if (!isSignedIn) return;

    function openPrepFromNotification(notification: Notifications.Notification) {
      const prepId = prepIdFromNotification(notification);
      if (prepId) router.push(`/prep/${prepId}`);
    }

    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response?.notification) openPrepFromNotification(response.notification);
    });

    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      openPrepFromNotification(response.notification);
    });

    return () => sub.remove();
  }, [isSignedIn, router]);

  return null;
}
