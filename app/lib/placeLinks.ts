import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import { openExternalUrl } from "./openExternalUrl";
import {
  isLikelyMapsHttpUrl,
  labelForBusinessMapsUrl,
  labelForPlaceRowAction,
  shouldOpenPlaceRowAsMap,
} from "./placeLinkHeuristics";

export {
  isLikelyMapsHttpUrl,
  labelForBusinessMapsUrl,
  labelForPlaceRowAction,
  shouldOpenPlaceRowAsMap,
} from "./placeLinkHeuristics";

export type NativeMapOpenInput = {
  name: string;
  address: string;
  lat: number;
  lng: number;
  /** Google / Apple Maps https URL — used when coords missing and URL looks like Maps. */
  mapsHttpUrl?: string;
};

/**
 * Opens the user’s default maps app (Apple Maps on iOS; geo: handler on Android).
 * Does not use in-app browser — avoids trapping Maps links in a web view.
 */
export async function openNativeMapsForPlace(input: NativeMapOpenInput): Promise<void> {
  const label = `${input.name} ${input.address}`.trim() || input.name.trim() || "Place";
  const { lat, lng } = input;
  const http = input.mapsHttpUrl?.trim();

  const open = async (u: string) => {
    await Linking.openURL(u);
  };

  try {
    if (lat !== 0 && lng !== 0) {
      if (Platform.OS === "ios") {
        await open(
          `http://maps.apple.com/?ll=${lat},${lng}&q=${encodeURIComponent(label)}`,
        );
      } else {
        await open(`geo:${lat},${lng}?q=${lat},${lng}(${encodeURIComponent(label)})`);
      }
      return;
    }
    if (http && isLikelyMapsHttpUrl(http)) {
      await open(http);
      return;
    }
    const q = encodeURIComponent(label);
    if (Platform.OS === "ios") {
      await open(`http://maps.apple.com/?q=${q}`);
    } else {
      await open(`geo:0,0?q=${q}`);
    }
  } catch (e) {
    console.warn("[openNativeMapsForPlace] failed", e);
  }
}

/**
 * Same map-opening strategy as PLACE_CARD (`openPlaceRow`): prefer **lat/lng** → native Maps,
 * then a **Google Maps HTTPS** URL, then **address + name** search; if `mapsUrl` is a non-map
 * website, open it in the in-app browser path (mirrors place “Website” row).
 */
export async function openBusinessListingInMaps(input: {
  name: string;
  address: string;
  lat: number;
  lng: number;
  mapsUrl: string;
}): Promise<void> {
  const urlTrimmed = input.mapsUrl.trim();
  if (shouldOpenPlaceRowAsMap({ lat: input.lat, lng: input.lng, urlTrimmed })) {
    await openNativeMapsForPlace({
      name: input.name,
      address: input.address,
      lat: input.lat,
      lng: input.lng,
      mapsHttpUrl: urlTrimmed && isLikelyMapsHttpUrl(urlTrimmed) ? urlTrimmed : undefined,
    });
    return;
  }
  if (urlTrimmed && /^https?:\/\//i.test(urlTrimmed)) {
    await openExternalUrl(urlTrimmed);
    return;
  }
  await openNativeMapsForPlace({
    name: input.name,
    address: input.address,
    lat: 0,
    lng: 0,
  });
}

export async function openBusinessMapsUrl(mapsUrl: string): Promise<void> {
  const u = mapsUrl.trim();
  if (!u) return;
  if (isLikelyMapsHttpUrl(u)) {
    try {
      await Linking.openURL(u);
    } catch (e) {
      console.warn("[openBusinessMapsUrl]", e);
    }
    return;
  }
  if (/^https?:\/\//i.test(u)) {
    try {
      await WebBrowser.openBrowserAsync(u);
      return;
    } catch {
      // Fall through to Linking (mirrors openExternalUrl).
    }
  }
  try {
    await Linking.openURL(u);
  } catch (e) {
    console.warn("[openBusinessMapsUrl]", e);
  }
}
