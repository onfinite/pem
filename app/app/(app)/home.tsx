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
import { pemImpactLight, pemSelection } from "@/lib/pemHaptics";
import { router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { X } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  ListRenderItem,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from "react-native";
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
    refresh,
    consumeHomeNavigationIntent,
  } = usePrepHub();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh({ skipCacheHydration: true });
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<PrepTab>("ready");
  const [hubToast, setHubToast] = useState<string | null>(null);
  const pullRefreshEnabled = tab === "ready" || tab === "prepping";

  useFocusEffect(
    useCallback(() => {
      const pending = consumeHomeNavigationIntent();
      if (pending) {
        setTab(pending.tab);
        setHubToast(pending.toast);
        pemSelection();
      }
    }, [consumeHomeNavigationIntent]),
  );

  useEffect(() => {
    if (!hubToast) return;
    const t = setTimeout(() => setHubToast(null), 3200);
    return () => clearTimeout(t);
  }, [hubToast]);

  const dismissHubToast = useCallback(() => {
    pemSelection();
    setHubToast(null);
  }, []);

  const onHubTab = useCallback(
    (t: PrepTab) => {
      pemImpactLight();
      if (t === tab) return;
      pemSelection();
      setTab(t);
    },
    [tab],
  );
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
            {pullRefreshEnabled && refreshing ? (
              <ActivityIndicator
                accessibilityLabel="Loading preps"
                color={colors.pemAmber}
              />
            ) : null}
            <HomePageHead sub={pageHead.sub} />
          </View>
        }
        ListEmptyComponent={listEmpty}
        ListFooterComponent={listFooter}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.3}
        ItemSeparatorComponent={() => <View style={{ height: space[4] }} />}
        showsVerticalScrollIndicator={false}
        refreshControl={
          pullRefreshEnabled ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void onRefresh()}
              tintColor={colors.pemAmber}
              colors={[colors.pemAmber]}
            />
          ) : undefined
        }
      />

      {hubToast ? (
        <View
          style={[styles.hubToastWrap, { top: scrollTopPad - space[3] + space[2] }]}
          pointerEvents="box-none"
        >
          <View
            style={[
              styles.hubToast,
              {
                backgroundColor: colors.brandMutedSurface,
                borderColor: colors.borderMuted,
              },
            ]}
          >
            <PemText style={[styles.hubToastText, { color: colors.textPrimary }]}>{hubToast}</PemText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss message"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={dismissHubToast}
              style={({ pressed }) => [styles.hubToastClose, { opacity: pressed ? 0.7 : 1 }]}
            >
              <X size={18} stroke={colors.textSecondary} strokeWidth={2} />
            </Pressable>
          </View>
        </View>
      ) : null}

      <HomeTopBar title={pageHead.title} glassBorder={glassBorder} />
      <HomeTabDock tab={tab} onTab={onHubTab} glassBorder={glassBorder} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  hubToastWrap: {
    position: "absolute",
    left: space[4],
    right: space[4],
    zIndex: 35,
  },
  hubToast: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: space[2],
    paddingLeft: space[4],
    paddingRight: space[2],
  },
  hubToastText: {
    flex: 1,
    minWidth: 0,
  },
  hubToastClose: {
    padding: space[2],
    justifyContent: "center",
    alignItems: "center",
  },
  scrollContent: {
    paddingHorizontal: space[4],
    gap: space[4],
    flexGrow: 1,
  },
});
