import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";

/** SFSafariViewController / Chrome Custom Tabs — not the system browser app alone. */
export async function openLinkInInAppBrowser(url: string): Promise<void> {
  const u = url.trim();
  if (!u) return;
  try {
    await WebBrowser.openBrowserAsync(u);
  } catch {
    void Linking.openURL(u).catch(() => {});
  }
}
