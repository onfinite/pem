import { pemAmber } from "@/constants/theme";
import { fontFamily } from "@/constants/typography";
import { useTheme } from "@/contexts/ThemeContext";
import {
  getExtractsOpen,
  getExtractsCalendar,
  getExtractsDone,
  triggerCalendarSync,
  patchExtractDone,
  patchExtractUndone,
  patchExtractDismiss,
  patchExtractUndismiss,
  patchExtractUpdate,
  type ApiExtract,
  type CalendarViewResponse,
  type UpdateExtractPayload,
} from "@/lib/pemApi";
import { pemImpactLight, pemNotificationSuccess } from "@/lib/pemHaptics";
import type { UndoItem } from "./UndoSnackbar";
import type { DateData } from "react-native-calendars";
import type { ForwardedRef } from "react";
import {
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { Animated, Dimensions, PanResponder } from "react-native";
import { buildMarkedDates } from "./buildMarkedDates";
import { SWIPE_THRESHOLD } from "./constants";
import { TASK_DRAWER_DONE_PAGE_SIZE } from "./inbox.constants";
import { toDateKey, toMonthKey } from "./dateKeys";
import {
  readOpenCache,
  writeOpenCache,
  readDoneCache,
  writeDoneCache,
} from "./taskCache";
import type { TaskDrawerHandle } from "./types";

export type Tab = "calendar" | "inbox" | "lists";

const SCREEN_H = Dimensions.get("window").height;

export function useTaskDrawerController(
  ref: ForwardedRef<TaskDrawerHandle | null>,
  onCountsChanged: (() => void) | undefined,
  getToken: () => Promise<string | null>,
) {
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);
  const [tab, setTab] = useState<Tab>("calendar");

  const [tasks, setTasks] = useState<ApiExtract[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [editExtract, setEditExtract] = useState<ApiExtract | null>(null);
  const [editVisible, setEditVisible] = useState(false);
  const [undoItem, setUndoItem] = useState<UndoItem | null>(null);
  const [doneItems, setDoneItems] = useState<ApiExtract[]>([]);
  const [doneNextCursor, setDoneNextCursor] = useState<string | null>(null);
  const [doneLoadingMore, setDoneLoadingMore] = useState(false);
  const doneLoadInFlight = useRef(false);

  const [calData, setCalData] = useState<CalendarViewResponse | null>(null);
  const [calLoading, setCalLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(toDateKey(new Date()));
  const [calMonth, setCalMonth] = useState<string>(toMonthKey(new Date()));

  const translateY = useRef(new Animated.Value(SCREEN_H)).current;

  const animateIn = useCallback(() => {
    translateY.setValue(SCREEN_H);
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      damping: 25,
      stiffness: 200,
    }).start();
  }, [translateY]);

  const animateOut = useCallback(
    (cb?: () => void) => {
      Animated.timing(translateY, {
        toValue: SCREEN_H,
        duration: 200,
        useNativeDriver: true,
      }).start(() => cb?.());
    },
    [translateY],
  );

  const scrollOffset = useRef(0);

  const makePanResponder = (requireScrollTop: boolean) =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => {
        if (requireScrollTop && scrollOffset.current > 2) return false;
        return g.dy > 10;
      },
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > SWIPE_THRESHOLD) {
          animateOut(() => setVisible(false));
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            damping: 25,
            stiffness: 200,
          }).start();
        }
      },
    });

  const panResponder = useRef(makePanResponder(false)).current;

  const fetchTasks = useCallback(async () => {
    setTasksLoading(true);
    setTasksError(false);
    const [cachedOpen, cachedDone] = await Promise.all([
      readOpenCache(),
      readDoneCache(),
    ]);
    if (cachedOpen.length > 0) setTasks(cachedOpen);
    if (cachedDone.length > 0) setDoneItems(cachedDone);
    if (cachedOpen.length > 0) setTasksLoading(false);
    try {
      const [openRes, doneRes] = await Promise.all([
        getExtractsOpen(getToken, { limit: 200 }),
        getExtractsDone(getToken, { limit: TASK_DRAWER_DONE_PAGE_SIZE }),
      ]);
      setTasks(openRes.items);
      setDoneItems(doneRes.items);
      setDoneNextCursor(doneRes.next_cursor);
      void writeOpenCache(openRes.items);
      void writeDoneCache(doneRes.items);
    } catch {
      if (cachedOpen.length === 0) setTasksError(true);
    } finally {
      setTasksLoading(false);
    }
  }, [getToken]);

  const loadMoreDone = useCallback(async () => {
    if (!doneNextCursor || doneLoadInFlight.current) return;
    doneLoadInFlight.current = true;
    setDoneLoadingMore(true);
    try {
      const res = await getExtractsDone(getToken, {
        limit: TASK_DRAWER_DONE_PAGE_SIZE,
        cursor: doneNextCursor,
      });
      setDoneItems((prev) => {
        const ids = new Set(prev.map((x) => x.id));
        const next = [...prev];
        for (const it of res.items) {
          if (!ids.has(it.id)) {
            ids.add(it.id);
            next.push(it);
          }
        }
        return next;
      });
      setDoneNextCursor(res.next_cursor);
    } catch (e) {
      console.warn("Failed to load more done:", e);
    } finally {
      doneLoadInFlight.current = false;
      setDoneLoadingMore(false);
    }
  }, [getToken, doneNextCursor]);

  const onInboxScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!doneNextCursor || doneLoadingMore) return;
      const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
      const pad = 160;
      if (
        layoutMeasurement.height + contentOffset.y >=
        contentSize.height - pad
      ) {
        void loadMoreDone();
      }
    },
    [doneNextCursor, doneLoadingMore, loadMoreDone],
  );

  const [calError, setCalError] = useState(false);
  const [tasksError, setTasksError] = useState(false);

  const fetchCalendar = useCallback(
    async (month?: string) => {
      setCalLoading(true);
      setCalError(false);
      try {
        const res = await getExtractsCalendar(getToken, month);
        setCalData(res);
      } catch {
        setCalError(true);
      } finally {
        setCalLoading(false);
      }
    },
    [getToken],
  );

  const handleManualSync = useCallback(async () => {
    setIsSyncing(true);
    try {
      await triggerCalendarSync(getToken);
      await fetchCalendar(calMonth);
    } catch {
      /* sync failure is non-critical */
    } finally {
      setIsSyncing(false);
    }
  }, [getToken, fetchCalendar, calMonth]);

  const [refreshing, setRefreshing] = useState(false);

  const fetchForTab = useCallback(
    (t: Tab) => {
      if (t === "calendar") fetchCalendar(calMonth);
      else if (t === "inbox" || t === "lists") fetchTasks();
    },
    [fetchCalendar, fetchTasks, calMonth],
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (tab === "calendar") await fetchCalendar(calMonth);
      else await fetchTasks();
    } finally {
      setRefreshing(false);
    }
  }, [tab, fetchCalendar, fetchTasks, calMonth]);

  useImperativeHandle(
    ref,
    () => ({
      open: () => {
        fetchForTab(tab);
        setVisible(true);
        setTimeout(animateIn, 10);
      },
      close: () => animateOut(() => setVisible(false)),
      refresh: () => {
        if (!visible) return;
        fetchForTab(tab);
      },
    }),
    [tab, visible, fetchForTab, animateIn, animateOut],
  );

  const removeItem = useCallback((id: string) => {
    setTasks((prev) => {
      const next = prev.filter((t) => t.id !== id);
      void writeOpenCache(next);
      return next;
    });
    setCalData((prev) => {
      if (!prev) return prev;
      const removed =
        prev.items.find((t) => t.id === id) ??
        prev.overdue.find((t) => t.id === id);
      const dotMap = { ...prev.dot_map };
      if (removed) {
        const anchor =
          removed.event_start_at ?? removed.due_at ?? removed.period_start;
        if (anchor) {
          const dateKey = anchor.slice(0, 10);
          const entry = dotMap[dateKey];
          if (entry) {
            const isEvent =
              removed.source === "calendar" || !!removed.external_event_id;
            const updated = {
              tasks: isEvent ? entry.tasks : Math.max(0, entry.tasks - 1),
              events: isEvent ? Math.max(0, entry.events - 1) : entry.events,
            };
            if (updated.tasks === 0 && updated.events === 0) {
              delete dotMap[dateKey];
            } else {
              dotMap[dateKey] = updated;
            }
          }
        }
      }
      return {
        ...prev,
        items: prev.items.filter((t) => t.id !== id),
        overdue: prev.overdue.filter((t) => t.id !== id),
        undated: prev.undated.filter((t) => t.id !== id),
        dot_map: dotMap,
      };
    });
  }, []);

  const removeTasksByListId = useCallback((listId: string) => {
    setTasks((prev) => {
      const next = prev.filter((t) => t.list_id !== listId);
      void writeOpenCache(next);
      return next;
    });
  }, []);

  const handleDone = useCallback(
    async (id: string) => {
      pemNotificationSuccess();
      const item = tasks.find((t) => t.id === id);
      removeItem(id);
      if (item) {
        setUndoItem({ id: item.id, text: item.text, action: "done" });
      }
      try {
        const { item: doneRow } = await patchExtractDone(getToken, id);
        onCountsChanged?.();
        setDoneItems((prev) => {
          if (prev.some((x) => x.id === id)) return prev;
          return [doneRow, ...prev];
        });
        fetchCalendar(calMonth);
      } catch {
        fetchTasks();
        fetchCalendar(calMonth);
      }
    },
    [getToken, removeItem, fetchTasks, fetchCalendar, calMonth, onCountsChanged, tasks],
  );

  const handleUndo = useCallback(
    async (id: string) => {
      pemImpactLight();
      const action = undoItem?.action;
      setUndoItem(null);
      try {
        if (action === "dismissed") {
          await patchExtractUndismiss(getToken, id);
        } else {
          await patchExtractUndone(getToken, id);
        }
        onCountsChanged?.();
        fetchTasks();
        fetchCalendar(calMonth);
      } catch {
        fetchTasks();
        fetchCalendar(calMonth);
      }
    },
    [getToken, fetchTasks, fetchCalendar, calMonth, onCountsChanged, undoItem],
  );

  const handleUndoExpire = useCallback(
    (id: string) => {
      setUndoItem((prev) => (prev?.id === id ? null : prev));
    },
    [],
  );

  const handleTabSwitch = useCallback(
    (t: Tab) => {
      setTab(t);
      fetchForTab(t);
    },
    [fetchForTab],
  );

  const openTaskEdit = useCallback((item: ApiExtract) => {
    setEditExtract(item);
    setEditVisible(true);
  }, []);

  const closeTaskEdit = useCallback(() => {
    setEditVisible(false);
    setEditExtract(null);
  }, []);

  const handleEditSave = useCallback(
    async (id: string, patch: Record<string, unknown>) => {
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } as ApiExtract : t)));
      setEditExtract((prev) => (prev?.id === id ? { ...prev, ...patch } as ApiExtract : prev));
      try {
        await patchExtractUpdate(getToken, id, patch as UpdateExtractPayload);
      } catch {
        fetchTasks();
      }
    },
    [getToken, fetchTasks],
  );

  const handleEditDone = useCallback(
    (id: string) => {
      closeTaskEdit();
      handleDone(id);
    },
    [closeTaskEdit, handleDone],
  );

  const handleEditDismiss = useCallback(
    async (id: string) => {
      const item = tasks.find((t) => t.id === id);
      closeTaskEdit();
      removeItem(id);
      if (item) {
        setUndoItem({ id: item.id, text: item.text, action: "dismissed" });
      }
      try {
        await patchExtractDismiss(getToken, id);
        onCountsChanged?.();
        fetchCalendar(calMonth);
      } catch {
        fetchTasks();
        fetchCalendar(calMonth);
      }
    },
    [closeTaskEdit, removeItem, getToken, onCountsChanged, fetchTasks, fetchCalendar, calMonth, tasks],
  );


  const markedDates = useMemo(
    () => buildMarkedDates(calData, selectedDate),
    [calData, selectedDate],
  );

  const dayItems = useMemo(() => {
    if (!calData) return [];
    return calData.items.filter((item) => {
      const anchor = item.event_start_at ?? item.due_at ?? item.period_start;
      if (anchor && toDateKey(new Date(anchor)) === selectedDate) return true;
      if (item.period_start && item.period_end) {
        const startKey = toDateKey(new Date(item.period_start));
        const endKey = toDateKey(new Date(item.period_end));
        return selectedDate >= startKey && selectedDate <= endKey;
      }
      return false;
    });
  }, [calData, selectedDate]);

  const calendarTheme = useMemo(
    () => ({
      calendarBackground: "transparent",
      todayTextColor: pemAmber,
      selectedDayBackgroundColor: pemAmber,
      selectedDayTextColor: "#ffffff",
      dayTextColor: colors.textPrimary,
      textDisabledColor: colors.textTertiary + "55",
      monthTextColor: colors.textPrimary,
      arrowColor: pemAmber,
      textDayFontFamily: fontFamily.sans.regular,
      textMonthFontFamily: fontFamily.display.semibold,
      textDayHeaderFontFamily: fontFamily.sans.medium,
      textDayFontSize: 14,
      textMonthFontSize: 16,
      textDayHeaderFontSize: 12,
    }),
    [colors],
  );

  const onDayPress = useCallback((day: DateData) => {
    setSelectedDate(day.dateString);
  }, []);

  const onMonthChange = useCallback(
    (month: DateData) => {
      const mk = `${month.year}-${String(month.month).padStart(2, "0")}`;
      setCalMonth(mk);
      fetchCalendar(mk);
    },
    [fetchCalendar],
  );

  return {
    visible,
    tab,
    tasks,
    tasksLoading,
    undoItem,
    doneItems,
    doneLoading: false,
    doneHasMore: !!doneNextCursor,
    doneLoadingMore,
    onInboxScroll,
    calData,
    calLoading,
    calError,
    tasksError,
    isSyncing,
    handleManualSync,
    selectedDate,
    translateY,
    panResponder,
    scrollOffset,
    animateOut,
    handleTabSwitch,
    handleDone,
    handleUndo,
    handleUndoExpire,
    markedDates,
    dayItems,
    calendarTheme,
    onDayPress,
    onMonthChange,
    setVisible,
    openTaskEdit,
    editExtract,
    editVisible,
    closeTaskEdit,
    handleEditSave,
    handleEditDone,
    handleEditDismiss,
    refreshing,
    handleRefresh,
    removeTasksByListId,
  };
}
