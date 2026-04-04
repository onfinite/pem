import HomePreppingEmpty from "@/components/sections/home-sections/HomePreppingEmpty";
import HomeReadyEmpty from "@/components/sections/home-sections/HomeReadyEmpty";
import HubSwipeableRow from "@/components/sections/home-sections/HubSwipeableRow";
import HubEmptyState from "@/components/shell/HubEmptyState";
import InboxDumpFab from "@/components/shell/InboxDumpFab";
import InboxHeader from "@/components/shell/InboxHeader";
import InboxShellTabBar from "@/components/shell/InboxShellTabBar";
import PrepInboxRow from "@/components/shell/PrepInboxRow";
import { usePrepHub } from "@/contexts/PrepHubContext";
import { useTheme } from "@/contexts/ThemeContext";
import {
  INBOX_DUMP_FAB_SIZE,
  INBOX_FAB_GAP_ABOVE_TAB,
  INBOX_SCROLL_CLEARANCE_ABOVE_BOTTOM_NAV,
  INBOX_TAB_BAR_FIXED_HEIGHT,
} from "@/components/sections/home-sections/homeLayout";
import { PREP_PAGE_SIZE } from "@/constants/limits";
import { useInboxShell } from "@/constants/shellTokens";
import { space } from "@/constants/typography";
import { apiPrepToPrep, searchPrepsPage, type ApiPrep } from "@/lib/pemApi";
import { useAuth } from "@clerk/expo";
import PemLoadingIndicator from "@/components/ui/PemLoadingIndicator";
import PemRefreshControl from "@/components/ui/PemRefreshControl";
import { pemSelection } from "@/lib/pemHaptics";
import { router } from "expo-router";
import { Archive } from "lucide-react-native";
import { useFocusEffect } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  ListRenderItem,
  Platform,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { Prep, PrepTab } from "@/components/sections/home-sections/homePrepData";

type HubRow = { kind: "prep"; prep: Prep };

function mergeHubTab(rows: ApiPrep[]): HubRow[] {
  const sorted = [...rows].sort((a, b) => {
    const ta = Date.parse(a.created_at);
    const tb = Date.parse(b.created_at);
    if (tb !== ta) return tb - ta;
    return b.id.localeCompare(a.id);
  });
  return sorted.map((api) => ({ kind: "prep" as const, prep: apiPrepToPrep(api) }));
}

/** Unread-ready first, then recency — Gmail-style Preps tab. */
function sortReadyApiPreps(rows: ApiPrep[]): ApiPrep[] {
  return [...rows].sort((a, b) => {
    const ua = a.status === "ready" && (a.opened_at === null || a.opened_at === undefined);
    const ub = b.status === "ready" && (b.opened_at === null || b.opened_at === undefined);
    if (ua !== ub) return ua ? -1 : 1;
    const ta = Date.parse(a.created_at);
    const tb = Date.parse(b.created_at);
    if (tb !== ta) return tb - ta;
    return b.id.localeCompare(a.id);
  });
}

function ArchivedTabEmptyInbox() {
  const { colors } = useTheme();
  return (
    <HubEmptyState
      compact
      smallIconWell
      icon={<Archive size={26} stroke={colors.textSecondary} strokeWidth={2} />}
      title="Archive is empty"
      body="Preps you've handled can show up here."
    />
  );
}

/** Preps hub — theme-aware inbox shell, top tabs, floating dump. */
export default function HomeScreen() {
  const { resolved } = useTheme();
  const s = useInboxShell();
  const {
    readyPrepRows,
    preppingPrepRows,
    archivedPrepRows,
    loadMore,
    hasMore,
    loadingMore,
    prepCounts,
    retryPrep,
    refresh,
    consumeHomeNavigationIntent,
    showHubToast,
  } = usePrepHub();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const started = Date.now();
    try {
      await refresh({ skipCacheHydration: true });
    } finally {
      const minMs = 450;
      const elapsed = Date.now() - started;
      if (elapsed < minMs) {
        await new Promise((r) => setTimeout(r, minMs - elapsed));
      }
      setRefreshing(false);
    }
  }, [refresh]);

  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<PrepTab>("ready");

  useFocusEffect(
    useCallback(() => {
      const pending = consumeHomeNavigationIntent();
      if (pending) {
        setTab(pending.tab);
        if (pending.toast) {
          showHubToast(pending.toast);
          pemSelection();
        }
      }
    }, [consumeHomeNavigationIntent, showHubToast]),
  );

  const onHubTab = useCallback((t: PrepTab) => {
    setTab(t);
  }, []);

  const hasPreps = readyPrepRows.length > 0;
  const hasPrepping = preppingPrepRows.length > 0;
  const nArchived = prepCounts?.archived ?? archivedPrepRows.length;

  const hasUnreadReady = useMemo(
    () =>
      readyPrepRows.some(
        (r) => r.status === "ready" && (r.opened_at === null || r.opened_at === undefined),
      ),
    [readyPrepRows],
  );

  const [searchInput, setSearchInput] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [searchRows, setSearchRows] = useState<ApiPrep[]>([]);
  const [searchCursor, setSearchCursor] = useState<string | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(searchInput.trim()), 320);
    return () => clearTimeout(t);
  }, [searchInput]);

  const searchActive = searchDebounced.length >= 2;
  const searchWaiting =
    searchActive && searchInput.trim().length >= 2 && searchInput.trim() !== searchDebounced;

  useEffect(() => {
    if (!searchActive) {
      setSearchRows((prev) => (prev.length === 0 ? prev : []));
      setSearchCursor((prev) => (prev === null ? prev : null));
      setSearchLoading((prev) => (prev === false ? prev : false));
      return;
    }
    let cancelled = false;
    setSearchLoading(true);
    const status =
      tab === "ready" ? "ready" : tab === "prepping" ? "prepping" : "archived";
    void (async () => {
      try {
        const res = await searchPrepsPage(() => getTokenRef.current(), {
          q: searchDebounced,
          status,
          limit: PREP_PAGE_SIZE,
        });
        if (cancelled) return;
        setSearchRows(res.items);
        setSearchCursor(res.next_cursor);
      } catch {
        if (!cancelled) {
          setSearchRows([]);
          setSearchCursor(null);
        }
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchActive, searchDebounced, tab]);

  const tabData: HubRow[] = useMemo(() => {
    if (searchActive) {
      const rows = tab === "ready" ? sortReadyApiPreps(searchRows) : searchRows;
      return mergeHubTab(rows);
    }
    if (tab === "ready") return mergeHubTab(sortReadyApiPreps(readyPrepRows));
    if (tab === "prepping") return mergeHubTab(preppingPrepRows);
    return mergeHubTab(archivedPrepRows);
  }, [
    searchActive,
    searchRows,
    tab,
    readyPrepRows,
    preppingPrepRows,
    archivedPrepRows,
  ]);

  const searchHasMore = Boolean(searchCursor) && searchActive;

  const loadMoreSearch = useCallback(async () => {
    if (!searchActive || !searchCursor) return;
    setSearchLoading(true);
    try {
      const status =
        tab === "ready" ? "ready" : tab === "prepping" ? "prepping" : "archived";
      const res = await searchPrepsPage(() => getTokenRef.current(), {
        q: searchDebounced,
        status,
        limit: PREP_PAGE_SIZE,
        cursor: searchCursor,
      });
      setSearchRows((prev) => [...prev, ...res.items]);
      setSearchCursor(res.next_cursor);
    } catch {
      /* ignore */
    } finally {
      setSearchLoading(false);
    }
  }, [searchActive, searchCursor, searchDebounced, tab]);

  const onEndReached = useCallback(() => {
    if (searchActive) {
      if (searchHasMore && !searchLoading) void loadMoreSearch();
      return;
    }
    if (tab === "ready" && hasMore.ready) void loadMore("ready");
    if (tab === "prepping" && hasMore.prepping) void loadMore("prepping");
    if (tab === "archived" && hasMore.archived) void loadMore("archived");
  }, [
    searchActive,
    searchHasMore,
    searchLoading,
    loadMoreSearch,
    tab,
    hasMore,
    loadMore,
  ]);

  const bottomPad =
    insets.bottom +
    INBOX_TAB_BAR_FIXED_HEIGHT +
    INBOX_FAB_GAP_ABOVE_TAB +
    INBOX_DUMP_FAB_SIZE +
    space[3] +
    INBOX_SCROLL_CLEARANCE_ABOVE_BOTTOM_NAV;

  const listIsEmpty = tabData.length === 0;

  const contentContainerStyle = useMemo(
    () => [
      styles.scrollContent,
      { paddingBottom: bottomPad },
      listIsEmpty && styles.scrollContentCentered,
    ],
    [bottomPad, listIsEmpty],
  );

  const renderItem: ListRenderItem<HubRow> = useCallback(
    ({ item, index }) => {
      const isLast = index === tabData.length - 1;
      const prep = item.prep;
      const canDelete = prep.dumpId !== undefined;

      if (tab === "prepping") {
        return (
          <PrepInboxRow
            prep={prep}
            mode="prepping"
            isLast={isLast}
            onOpen={() => router.push(`/prep/${prep.id}`)}
            onRetry={retryPrep}
          />
        );
      }

      if (tab === "ready") {
        return (
          <HubSwipeableRow variant="ready" prepId={prep.id} canDelete={canDelete} flat>
            <PrepInboxRow
              prep={prep}
              mode="ready"
              isLast={isLast}
              onOpen={() => router.push(`/prep/${prep.id}`)}
            />
          </HubSwipeableRow>
        );
      }

      return (
        <HubSwipeableRow variant="archived" prepId={prep.id} canDelete={canDelete} flat>
          <PrepInboxRow
            prep={prep}
            mode="archived"
            isLast={isLast}
            onOpen={() => router.push(`/prep/${prep.id}`)}
          />
        </HubSwipeableRow>
      );
    },
    [tab, tabData.length, retryPrep],
  );

  const listFooter =
    searchLoading ||
    (tab === "ready" && loadingMore.ready) ||
    (tab === "prepping" && loadingMore.prepping) ||
    (tab === "archived" && loadingMore.archived) ? (
      <PemLoadingIndicator placement="hubFooter" />
    ) : null;

  const listEmpty =
    searchActive && searchRows.length === 0 ? (
      searchLoading || searchWaiting ? (
        <PemLoadingIndicator placement="searchEmpty" />
      ) : (
        <HubEmptyState
          compact
          title="No matches"
          body={`No preps match “${searchDebounced}”.`}
        />
      )
    ) : tab === "ready" && !hasPreps ? (
      <HomeReadyEmpty variant="inbox" />
    ) : tab === "prepping" && !hasPrepping ? (
      <HomePreppingEmpty variant="inbox" />
    ) : tab === "archived" && nArchived === 0 ? (
      <ArchivedTabEmptyInbox />
    ) : null;

  return (
    <View style={[styles.screen, { backgroundColor: s.bg }]}>
      <StatusBar style={resolved === "dark" ? "light" : "dark"} />
      <InboxHeader searchValue={searchInput} onSearchChange={setSearchInput} />
      <FlatList
        key={tab}
        style={styles.list}
        data={tabData}
        keyExtractor={(item) => item.prep.id}
        renderItem={renderItem}
        contentContainerStyle={contentContainerStyle}
        ListEmptyComponent={listEmpty}
        ListFooterComponent={listFooter}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.3}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <PemRefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            progressViewOffset={Platform.OS === "android" ? 0 : undefined}
          />
        }
      />
      <InboxShellTabBar active={tab} onChange={onHubTab} hasUnreadReady={hasUnreadReady} />
      <InboxDumpFab />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  scrollContentCentered: {
    justifyContent: "center",
  },
});
