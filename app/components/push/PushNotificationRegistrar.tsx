import { setUserPushToken } from "@/lib/pemApi";
import { useAuth } from "@clerk/expo";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";

/**
 * Registers Expo push token; notification taps route to inbox (dump organized).
 * Requires a development or production build (Expo Go skips token registration) and
 * `EXPO_PUBLIC_EAS_PROJECT_ID` from `eas init` / EAS.
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

function kindFromNotification(
  notification: Notifications.Notification,
): string | null {
  const data = notification.request.content.data as Record<string, unknown> | undefined;
  const raw = data?.kind;
  return typeof raw === "string" ? raw : null;
}

function isExpoGo(): boolean {
  return Constants.appOwnership === "expo";
}

async function obtainExpoPushToken(): Promise<string | null> {
  if (Platform.OS === "web") {
    return null;
  }
  if (isExpoGo()) {
    return null;
  }
  if (!Device.isDevice) {
    return null;
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId?.trim()) {
    return null;
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let next = existing;
  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    next = status;
  }
  if (next !== "granted") {
    return null;
  }

  try {
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return token.data;
  } catch {
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
      } catch {
        /* ignore */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isSignedIn]);

  useEffect(() => {
    if (!isSignedIn) return;

    function openFromNotification(notification: Notifications.Notification) {
      const kind = kindFromNotification(notification);
      if (kind === "inbox_updated") {
        router.push("/chat");
      }
    }

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response?.notification) openFromNotification(response.notification);
    });

    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      openFromNotification(response.notification);
    });

    return () => sub.remove();
  }, [isSignedIn, router]);

  return null;
}
