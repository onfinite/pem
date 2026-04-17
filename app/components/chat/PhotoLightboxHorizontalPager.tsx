import { useCallback, useEffect, useRef, type ReactElement } from "react";
import {
  NativeSyntheticEvent,
  NativeScrollEvent,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import PagerView from "react-native-pager-view";

export type PhotoLightboxHorizontalPagerProps = {
  width: number;
  pageHeight: number;
  pageCount: number;
  initialPageIndex: number;
  onPageIndexChange: (index: number) => void;
  renderPage: (index: number) => ReactElement;
};

export function PhotoLightboxHorizontalPager(
  props: PhotoLightboxHorizontalPagerProps,
) {
  if (props.pageCount <= 0) return null;
  if (Platform.OS === "web") {
    return <PhotoLightboxWebPager {...props} />;
  }
  return <PhotoLightboxNativePager {...props} />;
}

function PhotoLightboxNativePager({
  width,
  pageHeight,
  pageCount,
  initialPageIndex,
  onPageIndexChange,
  renderPage,
}: PhotoLightboxHorizontalPagerProps) {
  const safeInitial = Math.min(
    Math.max(0, initialPageIndex),
    pageCount - 1,
  );

  const handlePageSelected = useCallback(
    (e: NativeSyntheticEvent<{ position: number }>) => {
      onPageIndexChange(e.nativeEvent.position);
    },
    [onPageIndexChange],
  );

  return (
    <PagerView
      style={[styles.pager, { width, height: pageHeight }]}
      initialPage={safeInitial}
      onPageSelected={handlePageSelected}
    >
      {Array.from({ length: pageCount }, (_, index) => (
        <View
          key={`page-${index}`}
          style={styles.page}
          collapsable={false}
        >
          {renderPage(index)}
        </View>
      ))}
    </PagerView>
  );
}

function PhotoLightboxWebPager({
  width,
  pageHeight,
  pageCount,
  initialPageIndex,
  onPageIndexChange,
  renderPage,
}: PhotoLightboxHorizontalPagerProps) {
  const scrollRef = useRef<ScrollView>(null);
  const safeInitial = Math.min(
    Math.max(0, initialPageIndex),
    pageCount - 1,
  );

  useEffect(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        x: width * safeInitial,
        animated: false,
      });
    });
  }, [width, safeInitial, pageCount]);

  const handleMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const page = Math.max(
        0,
        Math.min(
          Math.round(e.nativeEvent.contentOffset.x / width),
          pageCount - 1,
        ),
      );
      onPageIndexChange(page);
    },
    [width, pageCount, onPageIndexChange],
  );

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      onMomentumScrollEnd={handleMomentumEnd}
      style={[styles.pager, { width, height: pageHeight }]}
    >
      {Array.from({ length: pageCount }, (_, index) => (
        <View
          key={`wpage-${index}`}
          style={[styles.page, { width, height: pageHeight }]}
        >
          {renderPage(index)}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pager: { alignSelf: "center" },
  page: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
