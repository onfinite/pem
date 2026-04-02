import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";

/**
 * Opens external URLs without leaving uncaught promise rejections in the console.
 * For http(s), prefers `expo-web-browser` (Chrome Custom Tabs on Android) over raw
 * `Linking.openURL`, which often fails on Android 11+ with "Unable to open URL".
 */
export async function openExternalUrl(url: string): Promise<void> {
  const u = url.trim();
  if (!u) return;

  const isHttp = /^https?:\/\//i.test(u);

  if (isHttp) {
    try {
      await WebBrowser.openBrowserAsync(u);
      return;
    } catch {
      // Fall through to Linking (e.g. WebBrowser unavailable in some environments).
    }
  }

  try {
    await Linking.openURL(u);
  } catch (e) {
    console.warn("[openExternalUrl] could not open:", u, e);
  }
}
