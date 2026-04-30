import { PemPhotoRecallLightbox } from "@/components/chat/media/PemPhotoRecallLightbox";
import { HorizontalChatPhotoStrip } from "@/components/chat/media/HorizontalChatPhotoStrip";
import { useTheme } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, space } from "@/constants/typography";
import { pemImpactLight } from "@/lib/pemHaptics";
import type { PhotoRecallItem } from "@/services/api/pemApi";
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

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
      <HorizontalChatPhotoStrip
        uris={items.map((item) => item.signed_url)}
        secondarySurface={colors.secondarySurface}
        userBubbleText={colors.textSecondary}
        borderColor={colors.borderMuted}
        onOpenAt={handleOpenAt}
      />

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
});
