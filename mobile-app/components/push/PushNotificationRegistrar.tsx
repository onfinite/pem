import { isChatScreenFocusedRef } from "@/services/push/chatPushPresence";
import { setUserPushToken } from "@/services/api/pemApi";
import { useAuth } from "@clerk/expo";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";

function kindFromNotification(
  notification: Notifications.Notification,
): string | null {
  const data = notification.request.content.data as Record<string, unknown> | undefined;
  const raw = data?.kind;
  return typeof raw === "string" ? raw : null;
}

const CHAT_REPLY_KIND = "chat_reply";

/**
 * Registers Expo push token; taps route to chat for inbox / Pem reply / brief.
 * Chat reply pushes are still sent while the app is open (SSE delivers the message on chat);
 * we hide banner/list/sound for `chat_reply` only when the app is foreground **and** the Chat
 * screen is focused (`chatPushPresence`). Other screens still get the notification.
 * Requires a development or production build (Expo Go skips token registration) and
 * `EXPO_PUBLIC_EAS_PROJECT_ID` from `eas init` / EAS.
 */
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const isChatReply = kindFromNotification(notification) === CHAT_REPLY_KIND;
      const isForeground = AppState.currentState === "active";
      if (isChatReply && isForeground && isChatScreenFocusedRef.current) {
        return {
          shouldShowBanner: false,
          shouldShowList: false,
          shouldPlaySound: false,
          shouldSetBadge: false,
        };
      }
      return {
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      };
    },
  });
}

function isExpoGo(): boolean {
  return Constants.executionEnvironment === "storeClient";
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
      // App hub is `/chat` today (signed-in index also redirects there). `inbox_updated`
      // still uses its own payload kind so the client can branch later if `/inbox` exists.
      if (
        kind === "inbox_updated" ||
        kind === CHAT_REPLY_KIND ||
        kind === "daily_brief"
      ) {
        router.push("/chat");
      }
    }

    const lastResponse = Notifications.getLastNotificationResponse();
    if (lastResponse?.notification) openFromNotification(lastResponse.notification);

    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      openFromNotification(response.notification);
    });

    return () => sub.remove();
  }, [isSignedIn, router]);

  return null;
}
