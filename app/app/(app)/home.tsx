import HomePreppingEmpty from "@/components/sections/home-sections/HomePreppingEmpty";
import HomeReadyEmpty from "@/components/sections/home-sections/HomeReadyEmpty";
import HubSwipeableRow from "@/components/sections/home-sections/HubSwipeableRow";
import HubEmptyState from "@/components/shell/HubEmptyState";
import InboxDumpFab from "@/components/shell/InboxDumpFab";
import InboxHeader from "@/components/shell/InboxHeader";
import InboxHubDrawer from "@/components/shell/InboxHubDrawer";
import InboxHubSelectionBar from "@/components/shell/InboxHubSelectionBar";
import PrepInboxRow from "@/components/shell/PrepInboxRow";
import PemConfirmModal from "@/components/ui/PemConfirmModal";
import PemText from "@/components/ui/PemText";
import { usePrepHub } from "@/contexts/PrepHubContext";
import { useTheme } from "@/contexts/ThemeContext";
import {
  INBOX_LIST_BOTTOM_PADDING,
  INBOX_ROW_PAD_H,
} from "@/components/sections/home-sections/homeLayout";
import { PREP_PAGE_SIZE } from "@/constants/limits";
import { useInboxShell } from "@/constants/shellTokens";
import { apiPrepToPrep, searchPrepsPage, type ApiPrep } from "@/lib/pemApi";
import { useAuth } from "@clerk/expo";
import PemLoadingIndicator from "@/components/ui/PemLoadingIndicator";
import PemRefreshControl from "@/components/ui/PemRefreshControl";
import { pemImpactLight, pemSelection } from "@/lib/pemHaptics";
import { router } from "expo-router";
import { Archive, ListChecks, Star } from "lucide-react-native";
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

import { TABS, type Prep, type PrepTab } from "@/components/sections/home-sections/homePrepData";
import { fontFamily, fontSize, lh, lineHeight, space } from "@/constants/typography";

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

function StarredTabEmptyInbox() {
  const { colors } = useTheme();
  return (
    <HubEmptyState
      compact
      smallIconWell
      icon={<Star size={26} stroke={colors.textSecondary} strokeWidth={2} />}
      title="No starred preps"
      body="Star a prep from the list to find it here."
    />
  );
}

function DoneTabEmptyInbox() {
  const { colors } = useTheme();
  return (
    <HubEmptyState
      compact
      smallIconWell
      icon={<ListChecks size={26} stroke={colors.textSecondary} strokeWidth={2} />}
      title="Nothing in Done"
      body="Open a ready prep and tap Done when you’ve acted on it — it stays here, dimmed, so you can revisit anytime."
    />
  );
}

function sortApiPrepsByCreatedAtDesc(rows: ApiPrep[]): ApiPrep[] {
  return [...rows].sort((a, b) => {
    const ta = Date.parse(a.created_at);
    const tb = Date.parse(b.created_at);
    if (tb !== ta) return tb - ta;
    return b.id.localeCompare(a.id);
  });
}

/** Preps hub — theme-aware inbox shell, top tabs, floating dump. */
export default function HomeScreen() {
  const { resolved } = useTheme();
  const s = useInboxShell();
  const {
    readyPrepRows,
    readyPrepRowsEffective,
    preppingPrepRows,
    archivedPrepRows,
    starredPrepRows,
    donePrepRows,
    loadMore,
    hasMore,
    loadingMore,
    prepCounts,
    retryPrep,
    refresh,
    consumeHomeNavigationIntent,
    showHubToast,
    bulkArchivePreps,
    bulkUnarchivePreps,
    bulkDeletePreps,
    setStarPrep,
    unreadReadyCount,
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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkDeleteModal, setBulkDeleteModal] = useState(false);

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

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds([]);
  }, []);

  useEffect(() => {
    exitSelectMode();
  }, [tab, exitSelectMode]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  const onRowLongPress = useCallback(
    (prepId: string) => {
      pemImpactLight();
      if (selectMode) {
        toggleSelect(prepId);
      } else {
        setSelectMode(true);
        setSelectedIds([prepId]);
      }
    },
    [selectMode, toggleSelect],
  );

  const hasPreps = readyPrepRows.length > 0;
  const hasPrepping = preppingPrepRows.length > 0;
  const nArchived = prepCounts?.archived ?? archivedPrepRows.length;
  const nStarred =
    typeof prepCounts?.starred === "number" ? prepCounts.starred : starredPrepRows.length;
  const nDone = typeof prepCounts?.done === "number" ? prepCounts.done : donePrepRows.length;

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
    void (async () => {
      try {
        const statusParam =
          tab === "ready"
            ? "ready"
            : tab === "prepping"
              ? "prepping"
              : tab === "archived"
                ? "archived"
                : tab === "done"
                  ? "done"
                  : "ready";
        const res = await searchPrepsPage(() => getTokenRef.current(), {
          q: searchDebounced,
          status: statusParam,
          limit: PREP_PAGE_SIZE,
          starredOnly: tab === "starred",
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
      if (tab === "starred") {
        return mergeHubTab(sortApiPrepsByCreatedAtDesc(searchRows));
      }
      const rows =
        tab === "ready"
          ? sortReadyApiPreps(searchRows)
          : tab === "done"
            ? sortApiPrepsByCreatedAtDesc(searchRows)
            : searchRows;
      return mergeHubTab(rows);
    }
    if (tab === "ready") return mergeHubTab(sortReadyApiPreps(readyPrepRowsEffective));
    if (tab === "prepping") return mergeHubTab(preppingPrepRows);
    if (tab === "starred") return mergeHubTab(starredPrepRows);
    if (tab === "done") return mergeHubTab(sortApiPrepsByCreatedAtDesc(donePrepRows));
    return mergeHubTab(archivedPrepRows);
  }, [
    searchActive,
    searchRows,
    tab,
    readyPrepRowsEffective,
    preppingPrepRows,
    archivedPrepRows,
    starredPrepRows,
    donePrepRows,
  ]);

  useEffect(() => {
    if (searchActive) exitSelectMode();
  }, [searchActive, exitSelectMode]);

  const deletableSelectedIds = useMemo(() => {
    const idSet = new Set(selectedIds);
    const out: string[] = [];
    for (const row of tabData) {
      if (row.kind !== "prep") continue;
      if (!idSet.has(row.prep.id)) continue;
      if (row.prep.dumpId !== undefined) out.push(row.prep.id);
    }
    return out;
  }, [selectedIds, tabData]);

  const canBulkDelete = deletableSelectedIds.length > 0;

  const selectionBarArchiveUnarchive = useMemo(() => {
    if (tab !== "starred") return null;
    const idSet = new Set(selectedIds);
    let anyNonArch = false;
    let anyArch = false;
    for (const row of tabData) {
      if (row.kind !== "prep" || !idSet.has(row.prep.id)) continue;
      if (row.prep.status === "archived") anyArch = true;
      else anyNonArch = true;
    }
    return { showArchive: anyNonArch, showUnarchive: anyArch };
  }, [tab, selectedIds, tabData]);

  const openPrepOrToggle = useCallback(
    (prepId: string) => {
      if (selectMode) toggleSelect(prepId);
      else router.push(`/prep/${prepId}`);
    },
    [selectMode, toggleSelect],
  );

  /** Prepping hub rows don’t open detail — only multi-select toggle when active. */
  const toggleOnlyIfSelecting = useCallback(
    (prepId: string) => {
      if (selectMode) toggleSelect(prepId);
    },
    [selectMode, toggleSelect],
  );

  const handleBulkArchive = useCallback(async () => {
    if (selectedIds.length === 0) return;
    await bulkArchivePreps(selectedIds);
    exitSelectMode();
  }, [selectedIds, bulkArchivePreps, exitSelectMode]);

  const handleBulkUnarchive = useCallback(async () => {
    if (selectedIds.length === 0) return;
    await bulkUnarchivePreps(selectedIds);
    exitSelectMode();
  }, [selectedIds, bulkUnarchivePreps, exitSelectMode]);

  const handleBulkDeleteConfirm = useCallback(async () => {
    setBulkDeleteModal(false);
    pemSelection();
    if (deletableSelectedIds.length === 0) return;
    await bulkDeletePreps(deletableSelectedIds);
    exitSelectMode();
  }, [deletableSelectedIds, bulkDeletePreps, exitSelectMode]);

  const searchHasMore = Boolean(searchCursor) && searchActive;

  const loadMoreSearch = useCallback(async () => {
    if (!searchActive || !searchCursor) return;
    setSearchLoading(true);
    try {
      const statusParam =
        tab === "ready"
          ? "ready"
          : tab === "prepping"
            ? "prepping"
            : tab === "archived"
              ? "archived"
              : tab === "done"
                ? "done"
                : "ready";
      const res = await searchPrepsPage(() => getTokenRef.current(), {
        q: searchDebounced,
        status: statusParam,
        limit: PREP_PAGE_SIZE,
        cursor: searchCursor,
        starredOnly: tab === "starred",
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
    if (tab === "starred" && hasMore.starred) void loadMore("starred");
    if (tab === "done" && hasMore.done) void loadMore("done");
  }, [
    searchActive,
    searchHasMore,
    searchLoading,
    loadMoreSearch,
    tab,
    hasMore,
    loadMore,
  ]);

  const bottomPad = insets.bottom + INBOX_LIST_BOTTOM_PADDING;

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
      const selected = selectedIds.includes(prep.id);
      const starred = prep.starred === true;
      const starToggle = () => void setStarPrep(prep.id, !starred);

      if (tab === "starred") {
        const st = prep.status;
        if (st === "prepping" || st === "failed") {
          return (
            <PrepInboxRow
              prep={prep}
              mode="prepping"
              isLast={isLast}
              onOpen={() => toggleOnlyIfSelecting(prep.id)}
              onRetry={retryPrep}
              selectionMode={selectMode}
              selected={selected}
              onLongPress={() => onRowLongPress(prep.id)}
              starred={starred}
              onStarPress={starToggle}
            />
          );
        }
        if (st === "done") {
          return (
            <HubSwipeableRow
              variant="ready"
              prepId={prep.id}
              canDelete={canDelete}
              flat
              selectionMode={selectMode}
            >
              <PrepInboxRow
                prep={prep}
                mode="done"
                isLast={isLast}
                onOpen={() => openPrepOrToggle(prep.id)}
                selectionMode={selectMode}
                selected={selected}
                onLongPress={() => onRowLongPress(prep.id)}
                starred={starred}
                onStarPress={starToggle}
              />
            </HubSwipeableRow>
          );
        }
        if (st === "ready") {
          return (
            <HubSwipeableRow
              variant="ready"
              prepId={prep.id}
              canDelete={canDelete}
              flat
              selectionMode={selectMode}
            >
              <PrepInboxRow
                prep={prep}
                mode="ready"
                isLast={isLast}
                onOpen={() => openPrepOrToggle(prep.id)}
                selectionMode={selectMode}
                selected={selected}
                onLongPress={() => onRowLongPress(prep.id)}
                starred={starred}
                onStarPress={starToggle}
              />
            </HubSwipeableRow>
          );
        }
        return (
          <HubSwipeableRow
            variant="archived"
            prepId={prep.id}
            canDelete={canDelete}
            flat
            selectionMode={selectMode}
          >
            <PrepInboxRow
              prep={prep}
              mode="archived"
              isLast={isLast}
              onOpen={() => openPrepOrToggle(prep.id)}
              selectionMode={selectMode}
              selected={selected}
              onLongPress={() => onRowLongPress(prep.id)}
              starred={starred}
              onStarPress={starToggle}
            />
          </HubSwipeableRow>
        );
      }

      if (tab === "prepping") {
        return (
          <PrepInboxRow
            prep={prep}
            mode="prepping"
            isLast={isLast}
            onOpen={() => toggleOnlyIfSelecting(prep.id)}
            onRetry={retryPrep}
            selectionMode={selectMode}
            selected={selected}
            onLongPress={() => onRowLongPress(prep.id)}
            starred={starred}
            onStarPress={starToggle}
          />
        );
      }

      if (tab === "ready") {
        return (
          <HubSwipeableRow
            variant="ready"
            prepId={prep.id}
            canDelete={canDelete}
            flat
            selectionMode={selectMode}
          >
            <PrepInboxRow
              prep={prep}
              mode="ready"
              isLast={isLast}
              onOpen={() => openPrepOrToggle(prep.id)}
              selectionMode={selectMode}
              selected={selected}
              onLongPress={() => onRowLongPress(prep.id)}
              starred={starred}
              onStarPress={starToggle}
            />
          </HubSwipeableRow>
        );
      }

      if (tab === "done") {
        return (
          <HubSwipeableRow
            variant="ready"
            prepId={prep.id}
            canDelete={canDelete}
            flat
            selectionMode={selectMode}
          >
            <PrepInboxRow
              prep={prep}
              mode="done"
              isLast={isLast}
              onOpen={() => openPrepOrToggle(prep.id)}
              selectionMode={selectMode}
              selected={selected}
              onLongPress={() => onRowLongPress(prep.id)}
              starred={starred}
              onStarPress={starToggle}
            />
          </HubSwipeableRow>
        );
      }

      return (
        <HubSwipeableRow
          variant="archived"
          prepId={prep.id}
          canDelete={canDelete}
          flat
          selectionMode={selectMode}
        >
          <PrepInboxRow
            prep={prep}
            mode="archived"
            isLast={isLast}
            onOpen={() => openPrepOrToggle(prep.id)}
            selectionMode={selectMode}
            selected={selected}
            onLongPress={() => onRowLongPress(prep.id)}
            starred={starred}
            onStarPress={starToggle}
          />
        </HubSwipeableRow>
      );
    },
    [
      tab,
      tabData.length,
      retryPrep,
      selectMode,
      selectedIds,
      openPrepOrToggle,
      toggleOnlyIfSelecting,
      onRowLongPress,
      setStarPrep,
    ],
  );

  const showSearchPaginationFooter =
    searchActive && searchLoading && tabData.length > 0;
  const showTabPaginationFooter =
    !searchActive &&
    ((tab === "ready" && loadingMore.ready) ||
      (tab === "prepping" && loadingMore.prepping) ||
      (tab === "archived" && loadingMore.archived) ||
      (tab === "starred" && loadingMore.starred) ||
      (tab === "done" && loadingMore.done));

  const listFooter =
    showSearchPaginationFooter || showTabPaginationFooter ? (
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
      <HomeReadyEmpty />
    ) : tab === "prepping" && !hasPrepping ? (
      <HomePreppingEmpty variant="inbox" />
    ) : tab === "archived" && nArchived === 0 ? (
      <ArchivedTabEmptyInbox />
    ) : tab === "starred" && nStarred === 0 ? (
      <StarredTabEmptyInbox />
    ) : tab === "done" && nDone === 0 ? (
      <DoneTabEmptyInbox />
    ) : null;

  const bulkDeleteTitle =
    deletableSelectedIds.length <= 1
      ? "Delete this prep?"
      : `Delete ${deletableSelectedIds.length} preps?`;
  const bulkDeleteBody =
    "This can't be undone. Pem will remove those preps from your hub and stop any in-progress work.";
  const bulkDeleteConfirmLabel =
    deletableSelectedIds.length <= 1 ? "Delete" : `Delete ${deletableSelectedIds.length}`;

  const hubPageTitle = useMemo(
    () => TABS.find((x) => x.id === tab)?.label ?? "Preps",
    [tab],
  );

  /** Part of list content so pull-to-refresh sits above it; hidden on empty tabs (no rows). */
  const hubListHeader = useMemo(
    () =>
      selectMode || tabData.length === 0 ? null : (
        <View
          style={styles.hubListTitle}
          accessibilityRole="header"
          accessibilityLabel={hubPageTitle}
        >
          <PemText style={[styles.hubListTitleText, { color: s.amber }]}>{hubPageTitle}</PemText>
        </View>
      ),
    [selectMode, tabData.length, hubPageTitle, s.amber],
  );

  return (
    <>
      <View style={[styles.screen, { backgroundColor: s.bg }]}>
        <StatusBar style={resolved === "dark" ? "light" : "dark"} />
        {selectMode ? (
          <InboxHubSelectionBar
            count={selectedIds.length}
            tab={tab}
            onCancel={exitSelectMode}
            onArchive={
              tab === "ready" || tab === "prepping" || tab === "starred" || tab === "done"
                ? handleBulkArchive
                : undefined
            }
            onUnarchive={tab === "archived" || tab === "starred" ? handleBulkUnarchive : undefined}
            onDelete={() => setBulkDeleteModal(true)}
            canDelete={canBulkDelete}
            showArchiveAction={tab === "starred" ? selectionBarArchiveUnarchive?.showArchive : undefined}
            showUnarchiveAction={tab === "starred" ? selectionBarArchiveUnarchive?.showUnarchive : undefined}
          />
        ) : (
          <InboxHeader
            searchValue={searchInput}
            onSearchChange={setSearchInput}
            onOpenMenu={() => setDrawerOpen(true)}
            unreadReadyCount={unreadReadyCount}
          />
        )}
        <FlatList
          key={tab}
          style={styles.list}
          data={tabData}
          keyExtractor={(item) => item.prep.id}
          renderItem={renderItem}
          extraData={{ selectMode, selected: selectedIds.join(",") }}
          contentContainerStyle={contentContainerStyle}
          ListHeaderComponent={hubListHeader}
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
        <View
          style={{ opacity: selectMode ? 0 : 1 }}
          pointerEvents={selectMode ? "none" : "auto"}
        >
          <InboxDumpFab />
        </View>
        <InboxHubDrawer
          visible={drawerOpen}
          active={tab}
          onClose={() => setDrawerOpen(false)}
          onSelectTab={onHubTab}
          unreadReadyCount={unreadReadyCount}
        />
      </View>
      <PemConfirmModal
        visible={bulkDeleteModal}
        title={bulkDeleteTitle}
        body={bulkDeleteBody}
        confirmLabel={bulkDeleteConfirmLabel}
        confirmDestructive
        onCancel={() => setBulkDeleteModal(false)}
        onConfirm={() => void handleBulkDeleteConfirm()}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  /** Same horizontal inset as `PrepInboxRow` — sits directly above the first prep row. */
  hubListTitle: {
    paddingHorizontal: INBOX_ROW_PAD_H,
    paddingTop: space[1],
    paddingBottom: space[2],
  },
  hubListTitleText: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.sm,
    lineHeight: lh(fontSize.sm, lineHeight.snug),
    letterSpacing: 0.35,
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
