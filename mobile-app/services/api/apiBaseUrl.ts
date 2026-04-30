import Constants from "expo-constants";
import * as Device from "expo-device";
import { Platform } from "react-native";

function parseHostFromHostUri(hostUri: string | undefined): string | null {
  if (!hostUri) return null;
  const host = hostUri.split(":")[0]?.trim();
  if (!host) return null;
  return host;
}

function isLoopbackHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

/**
 * Resolves the Pem API base URL.
 * - Honors a non-loopback `EXPO_PUBLIC_API_URL` always (production or explicit LAN).
 * - In dev on a physical device, if env is loopback, uses Metro’s host on port 8000 so the phone
 *   reaches your Mac (127.0.0.1 on the device is the device itself).
 * - Simulators/emulators do not use Metro host replacement (hostUri can be wrong, e.g. 10.0.0.2);
 *   Android emulator uses 10.0.2.2 for the host machine.
 */
export function getApiBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "").trim() ?? "";

  const envLooksLoopback =
    !fromEnv ||
    fromEnv.includes("127.0.0.1") ||
    fromEnv.includes("localhost") ||
    fromEnv.includes("::1");

  if (fromEnv && !envLooksLoopback) {
    return fromEnv;
  }

  const metroHost = parseHostFromHostUri(Constants.expoConfig?.hostUri);

  if (
    __DEV__ &&
    Device.isDevice &&
    metroHost &&
    !isLoopbackHost(metroHost) &&
    envLooksLoopback
  ) {
    return `http://${metroHost}:8000`;
  }

  if (__DEV__ && Platform.OS === "android" && !Device.isDevice && envLooksLoopback) {
    return "http://10.0.2.2:8000";
  }

  if (fromEnv) {
    return fromEnv;
  }

  if (__DEV__) {
    if (Platform.OS === "android") {
      return "http://10.0.2.2:8000";
    }
    return "http://127.0.0.1:8000";
  }

  throw new Error("Set EXPO_PUBLIC_API_URL to your Pem API base URL (no trailing slash).");
}
