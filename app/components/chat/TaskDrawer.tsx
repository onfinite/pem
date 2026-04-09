import { pemAmber } from "@/constants/theme";
import { fontFamily, fontSize, space } from "@/constants/typography";
import { useTheme } from "@/contexts/ThemeContext";
import {
  getExtractsOpen,
  getExtractsCalendar,
  getExtractsDone,
  triggerCalendarSync,
  patchExtractDone,
  patchExtractDismiss,
  patchExtractUndone,
  patchExtractUndismiss,
  patchExtractSnooze,
  type ApiExtract,
  type CalendarViewResponse,
} from "@/lib/pemApi";
import { pemImpactLight, pemNotificationSuccess, pemSelection } from "@/lib/pemHaptics";
import { useAuth } from "@clerk/expo";
import {
  CheckCircle2,
  X,
  CalendarDays,
  Inbox,
  MapPin,
  Clock,
  ChevronDown,
  ChevronRight,
  ShoppingCart,
  Footprints,
  UserCheck,
} from "lucide-react-native";
import {
  forwardRef,
  memo,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Calendar, type DateData } from "react-native-calendars";

export type TaskDrawerHandle = {
  open: () => void;
  close: () => void;
  refresh: () => void;
};

type Tab = "calendar" | "inbox";

const SCREEN_H = Dimensions.get("window").height;
const DRAWER_H = SCREEN_H * 0.75;
const SWIPE_THRESHOLD = 80;

const CALENDAR_EVENT_DOT_COLOR = "#5b8def";

const BATCH_META: Record<string, { label: string; icon: typeof ShoppingCart }> =
  {
    shopping: { label: "Shopping", icon: ShoppingCart },
    errands: { label: "Errands", icon: Footprints },
    follow_ups: { label: "Follow-ups", icon: UserCheck },
  };

// ────────────────────────────────────────────────────────
// TaskItem — shared across all tabs
// ────────────────────────────────────────────────────────

function SwipeSnooze({
  itemId,
  onSnooze,
  children,
}: {
  itemId: string;
  onSnooze?: (id: string, until: string) => void;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  const translateX = useRef(new Animated.Value(0)).current;
  const [swiped, setSwiped] = useState(false);

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: (_, g) => {
        if (g.dx < 0) translateX.setValue(g.dx);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx < -60) {
          Animated.timing(translateX, {
            toValue: -120,
            duration: 150,
            useNativeDriver: true,
          }).start(() => setSwiped(true));
        } else {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
          }).start(() => setSwiped(false));
        }
      },
    }),
  ).current;

  const resetSwipe = useCallback(() => {
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
    setSwiped(false);
  }, [translateX]);

  if (!onSnooze) return <>{children}</>;

  return (
    <View style={{ overflow: "hidden" }}>
      {swiped && (
        <View style={[swipeStyles.chips, { backgroundColor: colors.secondarySurface }]}>
          {[
            { label: "Later", until: "later_today" },
            { label: "Tomorrow", until: "tomorrow" },
            { label: "Next week", until: "next_week" },
          ].map((opt) => (
            <Pressable
              key={opt.until}
              onPress={() => {
                onSnooze(itemId, opt.until);
                resetSwipe();
              }}
              style={[swipeStyles.chip, { backgroundColor: colors.cardBackground }]}
            >
              <Text style={[swipeStyles.chipText, { color: pemAmber }]}>{opt.label}</Text>
            </Pressable>
          ))}
          <Pressable onPress={resetSwipe} style={swipeStyles.chipCancel}>
            <X size={14} color={colors.textTertiary} />
          </Pressable>
        </View>
      )}
      <Animated.View
        style={{ transform: [{ translateX }] }}
        {...pan.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const swipeStyles = StyleSheet.create({
  chips: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: space[2],
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  chipText: {
    fontFamily: fontFamily.sans.medium,
    fontSize: 11,
  },
  chipCancel: {
    padding: 6,
  },
});

const TaskItem = memo(function TaskItem({
  item,
  onDone,
  onDismiss,
  onSnooze,
  compact,
}: {
  item: ApiExtract;
  onDone: (id: string) => void;
  onDismiss: (id: string) => void;
  onSnooze?: (id: string, until: string) => void;
  compact?: boolean;
}) {
  const { colors } = useTheme();
  const anchor = item.event_start_at ?? item.due_at;
  const isOverdue = !!anchor && new Date(anchor) < new Date();
  const isCalendarEvent = item.source === "calendar";

  const timeStr = useMemo(() => {
    if (!anchor) return null;
    return new Date(anchor).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  }, [anchor]);

  const dateStr = useMemo(() => {
    if (!anchor) return null;
    const d = new Date(anchor);
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    if (sameDay) return null;
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }, [anchor]);

  const urgencyLabel = useMemo(() => {
    if (item.urgency && item.urgency !== "none" && !anchor) {
      return item.urgency.replace("_", " ");
    }
    return null;
  }, [item.urgency, anchor]);

  return (
    <SwipeSnooze itemId={item.id} onSnooze={onSnooze}>
      <View
        style={[
          itemStyles.row,
          { borderBottomColor: colors.borderMuted },
          compact && { paddingVertical: space[2] },
        ]}
      >
        <View
          style={[
            itemStyles.dot,
            {
              backgroundColor: isCalendarEvent
                ? CALENDAR_EVENT_DOT_COLOR
                : pemAmber,
            },
          ]}
        />
        <View style={itemStyles.content}>
          <Text
            style={[itemStyles.text, { color: colors.textPrimary }]}
            numberOfLines={2}
          >
            {item.text}
          </Text>
          <View style={itemStyles.meta}>
            {isOverdue && (
              <Text style={[itemStyles.metaText, { color: "#e74c3c" }]}>
                overdue
              </Text>
            )}
            {!isOverdue && timeStr && (
              <View style={itemStyles.metaRow}>
                <Clock size={11} color={colors.textTertiary} />
                <Text
                  style={[itemStyles.metaText, { color: colors.textTertiary }]}
                >
                  {timeStr}
                </Text>
              </View>
            )}
            {!isOverdue && dateStr && (
              <Text
                style={[itemStyles.metaText, { color: colors.textTertiary }]}
              >
                {dateStr}
              </Text>
            )}
            {urgencyLabel && (
              <Text
                style={[itemStyles.metaText, { color: colors.textTertiary }]}
              >
                {urgencyLabel}
              </Text>
            )}
            {item.event_location && (
              <View style={itemStyles.metaRow}>
                <MapPin size={11} color={colors.textTertiary} />
                <Text
                  style={[itemStyles.metaText, { color: colors.textTertiary }]}
                  numberOfLines={1}
                >
                  {item.event_location}
                </Text>
              </View>
            )}
            {!compact && item.batch_key && (
              <View
                style={[
                  itemStyles.chip,
                  { backgroundColor: colors.secondarySurface },
                ]}
              >
                <Text
                  style={[itemStyles.chipText, { color: colors.textSecondary }]}
                >
                  {item.batch_key}
                </Text>
              </View>
            )}
            {isCalendarEvent && (
              <View style={[itemStyles.sourceBadge, { backgroundColor: CALENDAR_EVENT_DOT_COLOR + "22" }]}>
                <Text
                  style={[
                    itemStyles.sourceBadgeText,
                    { color: CALENDAR_EVENT_DOT_COLOR },
                  ]}
                >
                  {item.external_event_id ? "Google" : "Calendar"}
                </Text>
              </View>
            )}
          </View>
        </View>
        <View style={itemStyles.actions}>
          <Pressable
            onPress={() => onDone(item.id)}
            hitSlop={8}
            style={itemStyles.actionBtn}
          >
            <CheckCircle2 size={20} color={pemAmber} strokeWidth={2} />
          </Pressable>
          <Pressable
            onPress={() => onDismiss(item.id)}
            hitSlop={8}
            style={itemStyles.actionBtn}
          >
            <X size={16} color={colors.textTertiary} strokeWidth={2} />
          </Pressable>
        </View>
      </View>
    </SwipeSnooze>
  );
});

const itemStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 10,
    marginTop: 2,
    alignSelf: "flex-start",
  },
  content: { flex: 1 },
  text: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.base,
    lineHeight: 20,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 3,
    flexWrap: "wrap",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  metaText: { fontFamily: fontFamily.sans.regular, fontSize: fontSize.xs },
  chip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  chipText: { fontFamily: fontFamily.sans.medium, fontSize: 10 },
  sourceBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  sourceBadgeText: { fontFamily: fontFamily.sans.medium, fontSize: 10 },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginLeft: space[3],
  },
  actionBtn: { padding: 4 },
});

// ────────────────────────────────────────────────────────
// DayDetail — calendar day view
// ────────────────────────────────────────────────────────

function DayDetail({
  dateKey,
  items,
  overdueItems,
  onDone,
  onDismiss,
  onSnooze,
}: {
  dateKey: string;
  items: ApiExtract[];
  overdueItems: ApiExtract[];
  onDone: (id: string) => void;
  onDismiss: (id: string) => void;
  onSnooze?: (id: string, until: string) => void;
}) {
  const { colors } = useTheme();
  const isToday = dateKey === toDateKey(new Date());

  const label = useMemo(() => {
    const d = new Date(dateKey + "T12:00:00");
    if (isToday) return "Today";
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (dateKey === toDateKey(tomorrow)) return "Tomorrow";
    return d.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  }, [dateKey, isToday]);

  const sorted = useMemo(() => {
    const timed: ApiExtract[] = [];
    const untimed: ApiExtract[] = [];
    for (const item of items) {
      const a = item.event_start_at ?? item.due_at;
      if (a) timed.push(item);
      else untimed.push(item);
    }
    timed.sort((a, b) => {
      const aT = new Date(a.event_start_at ?? a.due_at ?? 0).getTime();
      const bT = new Date(b.event_start_at ?? b.due_at ?? 0).getTime();
      return aT - bT;
    });
    return [...timed, ...untimed];
  }, [items]);

  const showOverdue = isToday && overdueItems.length > 0;

  return (
    <View style={{ flex: 1 }}>
      <Text
        style={[
          dayStyles.dateLabel,
          { color: colors.textPrimary, paddingHorizontal: space[4] },
        ]}
      >
        {label}
      </Text>

      {showOverdue && (
        <>
          <Text
            style={[
              dayStyles.sectionLabel,
              { color: "#e74c3c", paddingHorizontal: space[4] },
            ]}
          >
            OVERDUE
          </Text>
          {overdueItems.map((item) => (
            <TaskItem
              key={item.id}
              item={item}
              onDone={onDone}
              onDismiss={onDismiss}
              onSnooze={onSnooze}
            />
          ))}
        </>
      )}

      {sorted.length === 0 && !showOverdue && (
        <Text
          style={[
            dayStyles.empty,
            { color: colors.textTertiary, paddingHorizontal: space[4] },
          ]}
        >
          Nothing scheduled
        </Text>
      )}

      {sorted.map((item) => (
        <TaskItem
          key={item.id}
          item={item}
          onDone={onDone}
          onDismiss={onDismiss}
          onSnooze={onSnooze}
        />
      ))}
    </View>
  );
}

const dayStyles = StyleSheet.create({
  dateLabel: {
    fontFamily: fontFamily.display.semibold,
    fontSize: fontSize.base,
    marginTop: space[3],
    marginBottom: space[1],
  },
  sectionLabel: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.xs,
    letterSpacing: 0.8,
    marginTop: space[2],
    marginBottom: space[1],
  },
  empty: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.sm,
    marginTop: space[3],
    textAlign: "center",
  },
});

// ────────────────────────────────────────────────────────
// InboxTab — grouped by batch_key with collapsible sections
// ────────────────────────────────────────────────────────

function InboxTab({
  tasks,
  loading,
  onDone,
  onDismiss,
  onSnooze,
  recentDone,
  onUndo,
  doneItems,
  doneLoading,
}: {
  tasks: ApiExtract[];
  loading: boolean;
  onDone: (id: string) => void;
  onDismiss: (id: string) => void;
  onSnooze: (id: string, until: string) => void;
  recentDone: ApiExtract[];
  onUndo: (id: string) => void;
  doneItems: ApiExtract[];
  doneLoading: boolean;
}) {
  const { colors } = useTheme();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    shopping: true,
    errands: true,
    follow_ups: true,
    done: true,
  });

  const groups = useMemo(() => {
    const batched: Record<string, ApiExtract[]> = {};
    const general: ApiExtract[] = [];
    for (const t of tasks) {
      if (t.batch_key && BATCH_META[t.batch_key]) {
        if (!batched[t.batch_key]) batched[t.batch_key] = [];
        batched[t.batch_key].push(t);
      } else {
        general.push(t);
      }
    }
    return { batched, general };
  }, [tasks]);

  const toggleSection = useCallback((key: string) => {
    pemSelection();
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  if (loading && tasks.length === 0) {
    return (
      <View style={inboxStyles.center}>
        <ActivityIndicator color={pemAmber} />
      </View>
    );
  }

  if (tasks.length === 0 && recentDone.length === 0) {
    return (
      <View style={inboxStyles.center}>
        <Text style={[inboxStyles.emptyText, { color: colors.textTertiary }]}>
          No open tasks. You're all caught up.
        </Text>
      </View>
    );
  }

  const batchKeys = Object.keys(BATCH_META).filter(
    (k) => groups.batched[k]?.length,
  );

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: space[4] }}
      showsVerticalScrollIndicator={false}
    >
      {/* Undo section */}
      {recentDone.length > 0 && (
        <View style={[inboxStyles.undoSection, { backgroundColor: colors.secondarySurface }]}>
          {recentDone.map((item) => (
            <View key={item.id} style={inboxStyles.undoRow}>
              <Text style={[inboxStyles.undoText, { color: colors.textSecondary }]} numberOfLines={1}>
                {item.text}
              </Text>
              <Pressable onPress={() => onUndo(item.id)} hitSlop={8}>
                <Text style={[inboxStyles.undoBtn, { color: pemAmber }]}>Undo</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {/* Batched groups first — collapsed by default */}
      {batchKeys.map((key) => {
        const meta = BATCH_META[key];
        const items = groups.batched[key];
        const isOpen = !collapsed[key];
        const Icon = meta.icon;

        return (
          <View key={key}>
            <Pressable
              onPress={() => toggleSection(key)}
              style={[
                inboxStyles.sectionHeader,
                { borderBottomColor: colors.borderMuted },
              ]}
            >
              <Icon size={16} color={pemAmber} />
              <Text
                style={[
                  inboxStyles.sectionTitle,
                  { color: colors.textPrimary },
                ]}
              >
                {meta.label}
              </Text>
              <Text
                style={[
                  inboxStyles.sectionCount,
                  { color: colors.textTertiary },
                ]}
              >
                {items.length}
              </Text>
              <View style={{ flex: 1 }} />
              {isOpen ? (
                <ChevronDown size={16} color={colors.textTertiary} />
              ) : (
                <ChevronRight size={16} color={colors.textTertiary} />
              )}
            </Pressable>
            {isOpen &&
              items.map((item) => (
                <TaskItem
                  key={item.id}
                  item={item}
                  onDone={onDone}
                  onDismiss={onDismiss}
                  onSnooze={onSnooze}
                  compact
                />
              ))}
          </View>
        );
      })}

      {/* General tasks */}
      {groups.general.length > 0 && batchKeys.length > 0 && (
        <View
          style={[
            inboxStyles.sectionHeader,
            { borderBottomColor: colors.borderMuted },
          ]}
        >
          <Inbox size={16} color={colors.textTertiary} />
          <Text
            style={[
              inboxStyles.sectionTitle,
              { color: colors.textPrimary },
            ]}
          >
            Tasks
          </Text>
          <Text
            style={[
              inboxStyles.sectionCount,
              { color: colors.textTertiary },
            ]}
          >
            {groups.general.length}
          </Text>
        </View>
      )}
      {groups.general.map((item) => (
        <TaskItem
          key={item.id}
          item={item}
          onDone={onDone}
          onDismiss={onDismiss}
          onSnooze={onSnooze}
        />
      ))}

      {/* Done section */}
      {doneItems.length > 0 && (
        <>
          <Pressable
            onPress={() => toggleSection("done")}
            style={[
              inboxStyles.sectionHeader,
              { borderBottomColor: colors.borderMuted, marginTop: space[2] },
            ]}
          >
            <CheckCircle2 size={16} color={colors.textTertiary} />
            <Text style={[inboxStyles.sectionTitle, { color: colors.textSecondary }]}>
              Done
            </Text>
            <Text style={[inboxStyles.sectionCount, { color: colors.textTertiary }]}>
              {doneItems.length}
            </Text>
            <View style={{ flex: 1 }} />
            {!collapsed.done ? (
              <ChevronDown size={16} color={colors.textTertiary} />
            ) : (
              <ChevronRight size={16} color={colors.textTertiary} />
            )}
          </Pressable>
          {!collapsed.done &&
            doneItems.slice(0, 10).map((item) => (
              <View
                key={item.id}
                style={[
                  inboxStyles.doneRow,
                  { borderBottomColor: colors.borderMuted },
                ]}
              >
                <CheckCircle2 size={14} color={colors.textTertiary} />
                <Text
                  style={[inboxStyles.doneText, { color: colors.textTertiary }]}
                  numberOfLines={1}
                >
                  {item.text}
                </Text>
                {item.done_at && (
                  <Text style={[inboxStyles.doneTime, { color: colors.textTertiary }]}>
                    {new Date(item.done_at).toLocaleDateString([], { month: "short", day: "numeric" })}
                  </Text>
                )}
              </View>
            ))}
        </>
      )}
    </ScrollView>
  );
}

const inboxStyles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: space[8],
  },
  emptyText: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.base,
    textAlign: "center",
    paddingHorizontal: space[4],
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionTitle: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.base,
  },
  sectionCount: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.sm,
  },
  undoSection: {
    paddingHorizontal: space[4],
    paddingVertical: space[2],
  },
  undoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    paddingVertical: space[1],
  },
  undoText: {
    flex: 1,
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.sm,
  },
  undoBtn: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.sm,
  },
  doneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: space[2],
    paddingHorizontal: space[4],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  doneText: {
    flex: 1,
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.sm,
    textDecorationLine: "line-through",
  },
  doneTime: {
    fontFamily: fontFamily.sans.regular,
    fontSize: 11,
  },
});

// ────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toMonthKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

// ────────────────────────────────────────────────────────
// Main Drawer
// ────────────────────────────────────────────────────────

const TaskDrawer = forwardRef<
  TaskDrawerHandle,
  { onCountsChanged?: () => void }
>(function TaskDrawer({ onCountsChanged }, ref) {
  const { colors } = useTheme();
  const { getToken } = useAuth();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [tab, setTab] = useState<Tab>("calendar");

  // Inbox tab state
  const [tasks, setTasks] = useState<ApiExtract[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [recentDone, setRecentDone] = useState<ApiExtract[]>([]);
  const [doneItems, setDoneItems] = useState<ApiExtract[]>([]);
  const [doneLoading, setDoneLoading] = useState(false);

  // Calendar tab state
  const [calData, setCalData] = useState<CalendarViewResponse | null>(null);
  const [calLoading, setCalLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(
    toDateKey(new Date()),
  );
  const [calMonth, setCalMonth] = useState<string>(toMonthKey(new Date()));

  const translateY = useRef(new Animated.Value(DRAWER_H)).current;

  const animateIn = useCallback(() => {
    translateY.setValue(DRAWER_H);
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
        toValue: DRAWER_H,
        duration: 200,
        useNativeDriver: true,
      }).start(() => cb?.());
    },
    [translateY],
  );

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 10,
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
    }),
  ).current;

  // ── Fetch open tasks (flat list for inbox + lists) ──

  const fetchTasks = useCallback(async () => {
    setTasksLoading(true);
    try {
      const [openRes, doneRes] = await Promise.all([
        getExtractsOpen(getToken, { limit: 200 }),
        getExtractsDone(getToken, { limit: 10 }),
      ]);
      setTasks(openRes.items);
      setDoneItems(doneRes.items);
    } catch (e) {
      console.warn("Failed to load tasks:", e);
    } finally {
      setTasksLoading(false);
    }
  }, [getToken]);

  // ── Fetch calendar view ──

  const fetchCalendar = useCallback(
    async (month?: string) => {
      setCalLoading(true);
      try {
        void triggerCalendarSync(getToken).catch(() => {});
        const res = await getExtractsCalendar(getToken, month);
        setCalData(res);
      } catch (e) {
        console.warn("Failed to load calendar:", e);
      } finally {
        setCalLoading(false);
      }
    },
    [getToken],
  );

  const fetchForTab = useCallback(
    (t: Tab) => {
      if (t === "calendar") fetchCalendar(calMonth);
      else if (t === "inbox") fetchTasks();
    },
    [fetchCalendar, fetchTasks, calMonth],
  );

  useImperativeHandle(ref, () => ({
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
  }));

  // ── Actions ──

  const removeItem = useCallback(
    (id: string) => {
      setTasks((prev) => prev.filter((t) => t.id !== id));
      if (calData) {
        setCalData({
          ...calData,
          items: calData.items.filter((t) => t.id !== id),
          overdue: calData.overdue.filter((t) => t.id !== id),
          undated: calData.undated.filter((t) => t.id !== id),
        });
      }
    },
    [calData],
  );

  const handleDone = useCallback(
    async (id: string) => {
      pemNotificationSuccess();
      const item = tasks.find((t) => t.id === id);
      removeItem(id);
      if (item) {
        setRecentDone((prev) => [item, ...prev].slice(0, 3));
        setTimeout(() => {
          setRecentDone((prev) => prev.filter((r) => r.id !== id));
        }, 30000);
      }
      try {
        await patchExtractDone(getToken, id);
        onCountsChanged?.();
      } catch {
        fetchTasks();
      }
    },
    [getToken, removeItem, fetchTasks, onCountsChanged, tasks],
  );

  const handleDismiss = useCallback(
    async (id: string) => {
      pemImpactLight();
      const item = tasks.find((t) => t.id === id);
      removeItem(id);
      if (item) {
        setRecentDone((prev) => [item, ...prev].slice(0, 3));
        setTimeout(() => {
          setRecentDone((prev) => prev.filter((r) => r.id !== id));
        }, 30000);
      }
      try {
        await patchExtractDismiss(getToken, id);
        onCountsChanged?.();
      } catch {
        fetchTasks();
      }
    },
    [getToken, removeItem, fetchTasks, onCountsChanged, tasks],
  );

  const handleUndo = useCallback(
    async (id: string) => {
      pemImpactLight();
      setRecentDone((prev) => prev.filter((r) => r.id !== id));
      try {
        await patchExtractUndone(getToken, id);
        onCountsChanged?.();
        fetchTasks();
      } catch {
        fetchTasks();
      }
    },
    [getToken, fetchTasks, onCountsChanged],
  );

  const handleSnooze = useCallback(
    async (id: string, until: string) => {
      pemImpactLight();
      removeItem(id);
      try {
        await patchExtractSnooze(getToken, id, until);
        onCountsChanged?.();
      } catch {
        fetchTasks();
      }
    },
    [getToken, removeItem, fetchTasks, onCountsChanged],
  );

  // ── Tab switch ──

  const handleTabSwitch = useCallback(
    (t: Tab) => {
      setTab(t);
      fetchForTab(t);
    },
    [fetchForTab],
  );

  // ── Calendar marked dates ──

  const markedDates = useMemo(() => {
    if (!calData) return {};
    const marks: Record<string, any> = {};
    for (const [dateKey, counts] of Object.entries(calData.dot_map)) {
      const dots: { key: string; color: string }[] = [];
      if (counts.tasks > 0) dots.push({ key: "task", color: pemAmber });
      if (counts.events > 0)
        dots.push({ key: "event", color: CALENDAR_EVENT_DOT_COLOR });
      marks[dateKey] = {
        dots,
        ...(dateKey === selectedDate ? { selected: true } : {}),
      };
    }
    if (!marks[selectedDate]) {
      marks[selectedDate] = { selected: true, dots: [] };
    } else {
      marks[selectedDate] = { ...marks[selectedDate], selected: true };
    }
    return marks;
  }, [calData, selectedDate]);

  const dayItems = useMemo(() => {
    if (!calData) return [];
    return calData.items.filter((item) => {
      const anchor = item.event_start_at ?? item.due_at ?? item.period_start;
      if (!anchor) return false;
      return toDateKey(new Date(anchor)) === selectedDate;
    });
  }, [calData, selectedDate]);

  // ── Calendar theme ──

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

  if (!visible) return null;

  const tabDef: { key: Tab; label: string; icon: typeof CalendarDays }[] = [
    { key: "calendar", label: "Calendar", icon: CalendarDays },
    { key: "inbox", label: "Inbox", icon: Inbox },
  ];

  return (
    <Modal
      transparent
      visible
      animationType="none"
      onRequestClose={() => animateOut(() => setVisible(false))}
    >
      <Pressable
        style={styles.backdrop}
        onPress={() => animateOut(() => setVisible(false))}
      />

      <Animated.View
        style={[
          styles.drawer,
          {
            height: DRAWER_H + insets.bottom,
            paddingBottom: insets.bottom,
            backgroundColor: colors.pageBackground,
            transform: [{ translateY }],
          },
        ]}
        {...panResponder.panHandlers}
      >
        {/* Handle */}
        <View style={styles.handleRow}>
          <View
            style={[styles.handle, { backgroundColor: colors.textTertiary }]}
          />
        </View>

        {/* Tabs */}
        <View
          style={[styles.tabRow, { borderBottomColor: colors.borderMuted }]}
        >
          {tabDef.map(({ key, label, icon: Icon }) => {
            const active = tab === key;
            return (
              <Pressable
                key={key}
                style={[
                  styles.tabBtn,
                  active && {
                    borderBottomColor: pemAmber,
                    borderBottomWidth: 2,
                  },
                ]}
                onPress={() => handleTabSwitch(key)}
              >
                <Icon
                  size={15}
                  color={active ? pemAmber : colors.textTertiary}
                />
                <Text
                  style={[
                    styles.tabLabel,
                    {
                      color: active
                        ? colors.textPrimary
                        : colors.textTertiary,
                    },
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}

          <View style={{ flex: 1 }} />

          <Text style={[styles.openCount, { color: colors.textTertiary }]}>
            {tab === "inbox"
              ? `${tasks.length} open`
              : calData
                ? `${dayItems.length} today`
                : ""}
          </Text>
        </View>

        {/* ── Calendar tab ── */}
        {tab === "calendar" && (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: space[4] }}
            showsVerticalScrollIndicator={false}
          >
            <Calendar
              markingType="multi-dot"
              markedDates={markedDates}
              onDayPress={onDayPress}
              onMonthChange={onMonthChange}
              theme={calendarTheme}
              enableSwipeMonths
              style={styles.calendar}
            />

            <View style={styles.legend}>
              <View style={styles.legendItem}>
                <View
                  style={[styles.legendDot, { backgroundColor: pemAmber }]}
                />
                <Text
                  style={[styles.legendText, { color: colors.textTertiary }]}
                >
                  Task
                </Text>
              </View>
              <View style={styles.legendItem}>
                <View
                  style={[
                    styles.legendDot,
                    { backgroundColor: CALENDAR_EVENT_DOT_COLOR },
                  ]}
                />
                <Text
                  style={[styles.legendText, { color: colors.textTertiary }]}
                >
                  Calendar
                </Text>
              </View>
            </View>

            {calLoading && !calData ? (
              <View style={styles.center}>
                <ActivityIndicator color={pemAmber} />
              </View>
            ) : (
              <DayDetail
                dateKey={selectedDate}
                items={dayItems}
                overdueItems={
                  selectedDate === toDateKey(new Date())
                    ? (calData?.overdue ?? [])
                    : []
                }
                onDone={handleDone}
                onDismiss={handleDismiss}
                onSnooze={handleSnooze}
              />
            )}
          </ScrollView>
        )}

        {/* ── Inbox tab ── */}
        {tab === "inbox" && (
          <InboxTab
            tasks={tasks}
            loading={tasksLoading}
            onDone={handleDone}
            onDismiss={handleDismiss}
            onSnooze={handleSnooze}
            recentDone={recentDone}
            onUndo={handleUndo}
            doneItems={doneItems}
            doneLoading={doneLoading}
          />
        )}
      </Animated.View>
    </Modal>
  );
});

export default TaskDrawer;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  drawer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 16,
  },
  handleRow: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 6,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    opacity: 0.4,
  },
  tabRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: space[2],
    paddingHorizontal: space[2],
    marginBottom: -StyleSheet.hairlineWidth,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabLabel: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.sm,
  },
  openCount: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.xs,
    marginRight: space[1],
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: space[8],
  },
  emptyText: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.base,
    textAlign: "center",
  },
  calendar: {
    marginHorizontal: space[2],
  },
  legend: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
    paddingVertical: space[2],
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.xs,
  },
});
