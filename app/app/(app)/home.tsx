import HomeTopBar from "@/components/sections/home-sections/HomeTopBar";
import HomePageHead from "@/components/sections/home-sections/HomePageHead";
import HomePreppingEmpty from "@/components/sections/home-sections/HomePreppingEmpty";
import HomeReadyEmpty from "@/components/sections/home-sections/HomeReadyEmpty";
import HomeReadyPrepCard from "@/components/sections/home-sections/HomeReadyPrepCard";
import {
  TAB_DOCK_INNER_MIN,
  TOP_BAR_ROW_PAD,
  TOP_ICON_CHIP,
  glassChromeBorder,
} from "@/components/sections/home-sections/homeLayout";
import PrepHubCard from "@/components/sections/home-sections/PrepHubCard";
import { PreppingRow } from "@/components/sections/home-sections/HomePreppingList";
import HomeTabDock from "@/components/sections/home-sections/HomeTabDock";
import type { Prep, PrepTab } from "@/components/sections/home-sections/homePrepData";
import { usePrepHub } from "@/contexts/PrepHubContext";
import { useTheme } from "@/contexts/ThemeContext";
import { space } from "@/constants/typography";
import PemText from "@/components/ui/PemText";
import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, ListRenderItem, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function ArchivedTabEmpty() {
  const { colors } = useTheme();
  return (
    <View style={{ paddingVertical: space[6], alignItems: "center" }}>
      <PemText variant="body" style={{ color: colors.textSecondary, textAlign: "center" }}>
        Nothing archived yet — when you finish with a prep, it can show up here.
      </PemText>
    </View>
  );
}

/** Preps hub — settings in top bar, tab dock, Ready / Prepping / Archived (paged lists). */
export default function HomeScreen() {
  const { colors, resolved } = useTheme();
  const {
    readyPreps,
    preppingPreps,
    archivedPreps,
    loadMore,
    hasMore,
    loadingMore,
    retryPrep,
  } = usePrepHub();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<PrepTab>("ready");
  const glassBorder = glassChromeBorder(resolved);

  const tabDockBottomSpace =
    insets.bottom + TAB_DOCK_INNER_MIN + space[1] + space[2];
  const bottomPad = tabDockBottomSpace + space[6];
  const scrollTopPad =
    insets.top + TOP_BAR_ROW_PAD * 2 + TOP_ICON_CHIP + space[1] + space[3];
  const hasPreps = readyPreps.length > 0;
  const hasPrepping = preppingPreps.length > 0;
  const nReady = readyPreps.length;
  const nPrepping = preppingPreps.length;
  const nArchived = archivedPreps.length;

  const tabData: Prep[] = useMemo(() => {
    if (tab === "ready") return readyPreps;
    if (tab === "prepping") return preppingPreps;
    return archivedPreps;
  }, [tab, readyPreps, preppingPreps, archivedPreps]);

  const pageHead =
    tab === "ready"
      ? {
          title: "Preps",
          sub: hasPreps
            ? `${nReady}${hasMore.ready ? "+" : ""} ready — open when you want to act.`
            : "Dump a thought first. Preps land here when they’re ready to open.",
        }
      : tab === "prepping"
        ? {
            title: "Prepping",
            sub: hasPrepping
              ? `${nPrepping}${hasMore.prepping ? "+" : ""} in progress — moves to Ready when done.`
              : "Nothing in the queue. New dumps show up here while Pem works.",
          }
        : {
            title: "Archived",
            sub:
              nArchived > 0
                ? `${nArchived}${hasMore.archived ? "+" : ""} archived — still here if you need to look back.`
                : "Finished or dismissed — still here if you need to look back.",
          };

  const onEndReached = useCallback(() => {
    if (tab === "ready" && hasMore.ready) void loadMore("ready");
    if (tab === "prepping" && hasMore.prepping) void loadMore("prepping");
    if (tab === "archived" && hasMore.archived) void loadMore("archived");
  }, [tab, hasMore, loadMore]);

  const renderItem: ListRenderItem<Prep> = useCallback(
    ({ item }) => {
      if (tab === "ready") {
        return <HomeReadyPrepCard prep={item} resolved={resolved} />;
      }
      if (tab === "prepping") {
        return (
          <PreppingRow
            prep={item}
            colors={colors}
            resolved={resolved}
            onRetry={retryPrep}
          />
        );
      }
      return (
        <PrepHubCard
          prep={item}
          resolved={resolved}
          archivedVisual
          onOpenDetail={() => router.push(`/prep/${item.id}`)}
        />
      );
    },
    [tab, colors, resolved, retryPrep],
  );

  const listFooter =
    (tab === "ready" && loadingMore.ready) ||
    (tab === "prepping" && loadingMore.prepping) ||
    (tab === "archived" && loadingMore.archived) ? (
      <ActivityIndicator style={{ marginVertical: space[4] }} color={colors.pemAmber} />
    ) : null;

  const listEmpty =
    tab === "ready" && !hasPreps ? (
      <HomeReadyEmpty />
    ) : tab === "prepping" && !hasPrepping ? (
      <HomePreppingEmpty />
    ) : tab === "archived" && nArchived === 0 ? (
      <ArchivedTabEmpty />
    ) : null;

  return (
    <View style={[styles.screen, { backgroundColor: colors.pageBackground }]}>
      <FlatList
        key={tab}
        data={tabData}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: scrollTopPad, paddingBottom: bottomPad },
        ]}
        ListHeaderComponent={
          <View style={{ gap: space[4], marginBottom: space[2] }}>
            <HomePageHead sub={pageHead.sub} />
          </View>
        }
        ListEmptyComponent={listEmpty}
        ListFooterComponent={listFooter}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.3}
        ItemSeparatorComponent={() => <View style={{ height: space[4] }} />}
        showsVerticalScrollIndicator={false}
      />

      <HomeTopBar title={pageHead.title} glassBorder={glassBorder} />
      <HomeTabDock tab={tab} onTab={setTab} glassBorder={glassBorder} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: space[4],
    gap: space[4],
    flexGrow: 1,
  },
});
