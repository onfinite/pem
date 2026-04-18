import { PhotoLightboxHorizontalPager } from "@/components/chat/PhotoLightboxHorizontalPager";
import { PhotoLightboxLayout } from "@/components/chat/PhotoLightboxLayout";
import {
  photoLightboxCaption,
  photoLightboxCaptionMaxHeight,
  photoLightboxFooterReserve,
} from "@/constants/photoLightbox.constants";
import { fontFamily, fontSize, space } from "@/constants/typography";
import type { PhotoRecallItem } from "@/lib/pemApi";
import { stripDocumentTypeFromVisionSummary } from "@/utils/stripDocumentTypeFromVisionSummary";
import { useCallback, useEffect, useState } from "react";
import { Image as ExpoImage } from "expo-image";
import {
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  items: PhotoRecallItem[];
  startIndex: number | null;
  onClose: () => void;
};

export function PemPhotoRecallLightbox({ items, startIndex, onClose }: Props) {
  const { width: winW, height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [pageIdx, setPageIdx] = useState(0);
  const [slotHeight, setSlotHeight] = useState(0);
  const visible = startIndex !== null;

  useEffect(() => {
    if (startIndex === null) return;
    setPageIdx(startIndex);
  }, [startIndex]);

  const handlePageChange = useCallback((i: number) => {
    setPageIdx(i);
  }, []);

  const current = items[pageIdx];
  const rawSummary = current?.vision_summary?.trim() ?? "";
  const summary = stripDocumentTypeFromVisionSummary(rawSummary).trim();

  const fallbackSlot = Math.max(
    280,
    winH -
      insets.top -
      insets.bottom -
      space[6] * 4 -
      photoLightboxFooterReserve,
  );
  const slot = slotHeight > 0 ? slotHeight : fallbackSlot;

  const footer =
    visible && summary ? (
      <View style={styles.footerInner}>
        <ScrollView
          style={styles.captionScroll}
          showsVerticalScrollIndicator
          nestedScrollEnabled
        >
          <Text style={styles.caption}>{summary}</Text>
        </ScrollView>
      </View>
    ) : null;

  return (
    <PhotoLightboxLayout visible={visible} onRequestClose={onClose} footer={footer}>
      {visible ? (
        <View
          style={[styles.slotMeasure, { width: winW }]}
          onLayout={(e) => setSlotHeight(e.nativeEvent.layout.height)}
        >
          {items.length > 1 ? (
            <PhotoLightboxHorizontalPager
              width={winW}
              pageHeight={slot}
              pageCount={items.length}
              initialPageIndex={startIndex ?? 0}
              onPageIndexChange={handlePageChange}
              renderPage={(index) => (
                <ExpoImage
                  source={{ uri: items[index].signed_url }}
                  style={{ width: winW, height: slot }}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                />
              )}
            />
          ) : (
            <View
              style={[styles.singlePage, { width: winW, height: slot }]}
            >
              <ExpoImage
                source={{ uri: items[0]?.signed_url ?? "" }}
                style={{ width: winW, height: slot }}
                contentFit="contain"
                cachePolicy="memory-disk"
              />
            </View>
          )}
        </View>
      ) : null}
    </PhotoLightboxLayout>
  );
}

const styles = StyleSheet.create({
  slotMeasure: { flex: 1 },
  singlePage: {
    justifyContent: "center",
    alignItems: "center",
  },
  footerInner: {
    gap: space[2],
    alignItems: "center",
    width: "100%",
  },
  captionScroll: {
    maxHeight: photoLightboxCaptionMaxHeight,
    width: "100%",
  },
  caption: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.sm,
    lineHeight: 22,
    textAlign: "center",
    color: photoLightboxCaption,
  },
});
