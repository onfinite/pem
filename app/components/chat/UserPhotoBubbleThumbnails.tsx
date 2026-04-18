import { fontFamily, fontSize, lh, space, radii } from "@/constants/typography";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";

type Props = {
  uris: string[];
  userBubbleText: string;
  secondarySurface: string;
};

export function UserPhotoBubbleThumbnails({
  uris,
  userBubbleText,
  secondarySurface,
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
        <Text style={[styles.placeholderText, { color: userBubbleText }]}>
          Photo
        </Text>
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
          <Image
            key={`${uri}-${i}`}
            source={{ uri }}
            style={styles.thumbSmall}
            resizeMode="cover"
          />
        ))}
      </ScrollView>
    );
  }

  return (
    <Image source={{ uri: uris[0]! }} style={styles.thumb} resizeMode="cover" />
  );
}

const styles = StyleSheet.create({
  thumbRow: { flexDirection: "row", gap: space[1], paddingVertical: 2 },
  thumb: {
    width: 200,
    height: 200,
    borderRadius: radii.md,
  },
  thumbSmall: {
    width: 72,
    height: 72,
    borderRadius: radii.md,
  },
  thumbPlaceholder: { alignItems: "center", justifyContent: "center" },
  placeholderText: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.base,
    lineHeight: lh(fontSize.base, 1.4),
  },
});
