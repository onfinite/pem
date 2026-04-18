import { pemAmber } from "@/constants/theme";
import { fontFamily, fontSize, lh, space, radii } from "@/constants/typography";
import { CachedChatPhotoTile } from "@/components/chat/CachedChatPhotoTile";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

type Props = {
  uris: string[];
  userBubbleText: string;
  secondarySurface: string;
  /** When true and there are no URIs yet, show a spinner instead of "Photo". */
  isSending?: boolean;
};

const THUMB_LARGE = 200;
const THUMB_SMALL = 72;

export function UserPhotoBubbleThumbnails({
  uris,
  userBubbleText,
  secondarySurface,
  isSending = false,
}: Props) {
  if (uris.length === 0) {
    return (
      <View
        style={[
          styles.thumb,
          styles.thumbPlaceholder,
          { backgroundColor: secondarySurface },
        ]}
      >
        {isSending ? (
          <ActivityIndicator color={pemAmber} />
        ) : (
          <Text style={[styles.placeholderText, { color: userBubbleText }]}>
            Photo
          </Text>
        )}
      </View>
    );
  }

  if (uris.length > 1) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.thumbRow}
      >
        {uris.map((uri, i) => (
          <CachedChatPhotoTile
            key={`${uri}-${i}`}
            uri={uri}
            width={THUMB_SMALL}
            height={THUMB_SMALL}
            borderRadius={radii.md}
            skeletonFill={secondarySurface}
          />
        ))}
      </ScrollView>
    );
  }

  const first = uris[0]!;
  return (
    <CachedChatPhotoTile
      key={first}
      uri={first}
      width={THUMB_LARGE}
      height={THUMB_LARGE}
      borderRadius={radii.md}
      skeletonFill={secondarySurface}
    />
  );
}

const styles = StyleSheet.create({
  thumbRow: { flexDirection: "row", gap: space[1], paddingVertical: 2 },
  thumb: {
    width: THUMB_LARGE,
    height: THUMB_LARGE,
    borderRadius: radii.md,
  },
  thumbPlaceholder: { alignItems: "center", justifyContent: "center" },
  placeholderText: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.base,
    lineHeight: lh(fontSize.base, 1.4),
  },
});
