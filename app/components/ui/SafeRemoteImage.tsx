import { useState } from "react";
import { Image, type ImageProps, StyleSheet, View } from "react-native";

import { isLikelyBlockedRemoteImageUrl, normalizeRemoteImageUri } from "@/services/media/remoteImageUrl";

type Props = Omit<ImageProps, "source"> & {
  uri: string;
};

/**
 * Remote image that hides itself when the URL is known-bad for RN or `onError` fires (403, etc.).
 */
export default function SafeRemoteImage({ uri, style, ...rest }: Props) {
  const blocked = isLikelyBlockedRemoteImageUrl(uri);
  const [failed, setFailed] = useState(false);
  if (blocked || failed || !uri.trim()) {
    return null;
  }
  return (
    <Image
      {...rest}
      source={{ uri }}
      style={style}
      onError={() => setFailed(true)}
      accessibilityIgnoresInvertColors
    />
  );
}

/** Placeholder block when you need fixed height without an image (e.g. card layout). */
export function RemoteImageOrPlaceholder({
  uri,
  style,
  placeholderStyle,
  resizeMode = "cover",
  ...rest
}: {
  uri: string;
  style: ImageProps["style"];
  placeholderStyle?: ImageProps["style"];
  resizeMode?: ImageProps["resizeMode"];
} & Omit<ImageProps, "source" | "style">) {
  const normalized = normalizeRemoteImageUri(uri);
  const blocked = isLikelyBlockedRemoteImageUrl(normalized);
  const [failed, setFailed] = useState(false);
  if (blocked || failed || !normalized) {
    return <View style={[StyleSheet.flatten(style), placeholderStyle]} />;
  }
  return (
    <Image
      {...rest}
      source={{ uri: normalized }}
      style={style}
      onError={() => setFailed(true)}
      resizeMode={resizeMode}
      accessibilityIgnoresInvertColors
    />
  );
}
