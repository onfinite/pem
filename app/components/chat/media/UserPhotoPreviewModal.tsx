import { PhotoLightboxHorizontalPager } from "@/components/chat/media/PhotoLightboxHorizontalPager";
import { PhotoLightboxLayout } from "@/components/chat/media/PhotoLightboxLayout";
import { photoLightboxFooterReserve } from "@/constants/photoLightbox.constants";
import { space } from "@/constants/typography";
import { pemImpactLight } from "@/lib/pemHaptics";
import { useCallback, useState } from "react";
import {
  Image,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  uris: string[];
  startIndex: number | null;
  onClose: () => void;
};

export function UserPhotoPreviewModal({ uris, startIndex, onClose }: Props) {
  const { width: winW, height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [slotHeight, setSlotHeight] = useState(0);
  const visible = startIndex !== null;
  const showPager = uris.length > 1;

  const handleClose = useCallback(() => {
    pemImpactLight();
    onClose();
  }, [onClose]);

  const noopPageChange = useCallback(() => {}, []);

  const fallbackSlot = Math.max(
    280,
    winH -
      insets.top -
      insets.bottom -
      space[6] * 4 -
      photoLightboxFooterReserve,
  );
  const slot = slotHeight > 0 ? slotHeight : fallbackSlot;

  return (
    <PhotoLightboxLayout visible={visible} onRequestClose={handleClose}>
      {visible ? (
        <View
          style={[styles.slotMeasure, { width: winW }]}
          onLayout={(e) => setSlotHeight(e.nativeEvent.layout.height)}
        >
          {showPager ? (
            <PhotoLightboxHorizontalPager
              width={winW}
              pageHeight={slot}
              pageCount={uris.length}
              initialPageIndex={startIndex ?? 0}
              onPageIndexChange={noopPageChange}
              renderPage={(index) => (
                <Image
                  source={{ uri: uris[index] }}
                  style={{ width: winW, height: slot }}
                  resizeMode="contain"
                />
              )}
            />
          ) : uris[0] ? (
            <View
              style={[styles.singlePage, { width: winW, height: slot }]}
            >
              <Image
                source={{ uri: uris[0] }}
                style={{ width: winW, height: slot }}
                resizeMode="contain"
              />
            </View>
          ) : null}
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
});
