import { CachedChatPhotoTile } from "@/components/chat/media/CachedChatPhotoTile";
import { pemAmber } from "@/constants/theme";
import { CHAT_PHOTO_THUMB_SIZE } from "@/constants/chatPhotos.constants";
import { fontFamily, fontSize, lh, radii, space } from "@/constants/typography";
import { pemImpactLight } from "@/lib/pemHaptics";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

type Props = {
  uris: string[];
  secondarySurface: string;
  /** Used for empty-state “Photo” label color. */
  userBubbleText: string;
  borderColor: string;
  isSending?: boolean;
  onOpenAt?: (index: number) => void;
};

export function HorizontalChatPhotoStrip({
  uris,
  secondarySurface,
  userBubbleText,
  borderColor,
  isSending = false,
  onOpenAt,
}: Props) {
  const tile = CHAT_PHOTO_THUMB_SIZE;

  if (uris.length === 0) {
    return (
      <View style={[styles.tile, { borderColor }]}>
        <View
          style={[
            styles.innerEmpty,
            {
              width: tile,
              height: tile,
              backgroundColor: secondarySurface,
              borderRadius: radii.md,
            },
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
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {uris.map((uri, index) => {
        const image = (
          <CachedChatPhotoTile
            uri={uri}
            width={tile}
            height={tile}
            borderRadius={radii.md}
            skeletonFill={secondarySurface}
          />
        );
        if (!onOpenAt) {
          return (
            <View
              key={`${uri}-${index}`}
              style={[styles.tile, { borderColor }]}
            >
              {image}
            </View>
          );
        }
        return (
          <Pressable
            key={`${uri}-${index}`}
            accessibilityRole="button"
            accessibilityLabel={`Open photo ${index + 1} of ${uris.length}`}
            onPress={() => {
              pemImpactLight();
              onOpenAt(index);
            }}
            style={[styles.tile, { borderColor }]}
          >
            {image}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: space[2],
    paddingVertical: 2,
    alignItems: "center",
  },
  tile: {
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  innerEmpty: {
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.sm,
    lineHeight: lh(fontSize.sm, 1.35),
  },
});
