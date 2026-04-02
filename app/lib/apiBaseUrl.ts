import Constants from "expo-constants";
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
 * - Honors `EXPO_PUBLIC_API_URL` when it is a real host (not loopback), or in production.
 * - In dev, if env points at loopback but Metro is bound to a LAN IP (physical device), uses that
 *   host on port 8000 so the phone can reach your machine (127.0.0.1 on device is the phone itself).
 */
export function getApiBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "").trim() ?? "";

  const metroHost = parseHostFromHostUri(Constants.expoConfig?.hostUri);

  if (__DEV__ && metroHost && !isLoopbackHost(metroHost)) {
    const envLooksLoopback =
      !fromEnv ||
      fromEnv.includes("127.0.0.1") ||
      fromEnv.includes("localhost") ||
      fromEnv.includes("::1");
    if (envLooksLoopback) {
      return `http://${metroHost}:8000`;
    }
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
