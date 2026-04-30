import { Image as ExpoImage } from "expo-image";
import { StyleSheet, View } from "react-native";

type CachedChatPhotoTileProps = {
  uri: string;
  width: number;
  height: number;
  borderRadius: number;
  /** Shown behind the image until pixels are ready (no spinner — avoids remount flicker). */
  skeletonFill: string;
};

/**
 * Chat photo tile: disk-backed cache for remotes, no load-state UI.
 * A spinner here looked like a “second fetch” because FlatList remounts
 * (e.g. after `loadMessages` replaces the list) reset local `useState` even
 * when `expo-image` still had the bytes in memory-disk cache.
 */
export function CachedChatPhotoTile({
  uri,
  width,
  height,
  borderRadius,
  skeletonFill,
}: CachedChatPhotoTileProps) {
  return (
    <View
      style={[
        styles.wrap,
        { width, height, borderRadius, backgroundColor: skeletonFill },
      ]}
    >
      <ExpoImage
        source={{ uri }}
        style={{ width, height, borderRadius }}
        contentFit="cover"
        cachePolicy="memory-disk"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: "hidden",
  },
});
