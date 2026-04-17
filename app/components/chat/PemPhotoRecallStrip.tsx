import { PemPhotoRecallLightbox } from "@/components/chat/PemPhotoRecallLightbox";
import { useTheme } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, space, radii } from "@/constants/typography";
import { pemImpactLight } from "@/lib/pemHaptics";
import type { PhotoRecallItem } from "@/lib/pemApi";
import { useCallback, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

type Props = {
  items: PhotoRecallItem[];
};

export function PemPhotoRecallStrip({ items }: Props) {
  const { colors } = useTheme();
  const [lightboxStart, setLightboxStart] = useState<number | null>(null);

  const handleCloseModal = useCallback(() => {
    pemImpactLight();
    setLightboxStart(null);
  }, []);

  const handleOpenAt = useCallback((index: number) => {
    pemImpactLight();
    setLightboxStart(index);
  }, []);

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>
        From your photos
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.row}>
          {items.map((item, index) => (
            <Pressable
              key={`${item.message_id}-${item.image_key}-${index}`}
              onPress={() => handleOpenAt(index)}
              style={[styles.tile, { borderColor: colors.borderMuted }]}
            >
              <Image
                source={{ uri: item.signed_url }}
                style={[styles.thumb, { backgroundColor: colors.secondarySurface }]}
                resizeMode="cover"
              />
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <PemPhotoRecallLightbox
        items={items}
        startIndex={lightboxStart}
        onClose={handleCloseModal}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: space[2], gap: space[1] },
  label: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.xs,
  },
  row: { flexDirection: "row", gap: space[2], paddingVertical: 2 },
  tile: {
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  thumb: { width: 72, height: 72 },
});
