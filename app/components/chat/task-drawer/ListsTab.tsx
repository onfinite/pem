import { pemAmber } from "@/constants/theme";
import { fontFamily, fontSize, radii, space } from "@/constants/typography";
import { useTheme } from "@/contexts/ThemeContext";
import type { ApiExtract, ApiList } from "@/lib/pemApi";
import { pemSelection } from "@/lib/pemHaptics";
import {
  ChevronDown,
  ChevronRight,
  List,
  Plus,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { InboxSectionItemsGroup } from "./InboxSectionItemsGroup";
import { inboxStyles } from "./inboxTab.styles";
import { dismissOpenTaskSwipe } from "./taskSwipeRegistry";
import { TaskItem } from "./TaskItem";

/** Lets `onSubmitEditing` run before blur-driven dismiss (same tap as keyboard Done). */
const CREATE_ROW_BLUR_DISMISS_MS = 180;
/** Drawer header + tab row below the top safe-area spacer (see TaskDrawerView). */
const KEYBOARD_OFFSET_BELOW_SAFE_AREA = 56;

interface ListsTabProps {
  lists: ApiList[];
  tasks: ApiExtract[];
  loading: boolean;
  onCloseTask: (id: string) => void;
  onEditTask: (item: ApiExtract) => void;
  onRefresh: () => void;
  refreshing: boolean;
  onAddList: (name: string) => Promise<void>;
  onDeleteList: (id: string) => Promise<void>;
}

export function ListsTab({
  lists,
  tasks,
  loading,
  onCloseTask,
  onEditTask,
  onRefresh,
  refreshing,
  onAddList,
  onDeleteList,
}: ListsTabProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [isCreating, setIsCreating] = useState(false);
  const [isSubmittingList, setIsSubmittingList] = useState(false);
  const [newListName, setNewListName] = useState("");
  const inputRef = useRef<TextInput>(null);
  const blurDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSubmittingListRef = useRef(false);

  const cancelBlurDismissTimer = useCallback(() => {
    if (blurDismissTimerRef.current != null) {
      clearTimeout(blurDismissTimerRef.current);
      blurDismissTimerRef.current = null;
    }
  }, []);

  const dismissCreateRow = useCallback(() => {
    if (isSubmittingListRef.current) return;
    cancelBlurDismissTimer();
    inputRef.current?.blur();
    Keyboard.dismiss();
    setIsCreating(false);
    setNewListName("");
  }, [cancelBlurDismissTimer]);

  useEffect(() => () => cancelBlurDismissTimer(), [cancelBlurDismissTimer]);

  const sortedLists = useMemo(() => {
    return [...lists].sort((a, b) => {
      if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return (
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    });
  }, [lists]);

  const grouped = useMemo(() => {
    const byList: Record<string, ApiExtract[]> = {};
    for (const t of tasks) {
      const key = t.list_id ?? "__none__";
      if (!byList[key]) byList[key] = [];
      byList[key].push(t);
    }
    return byList;
  }, [tasks]);

  const toggle = useCallback(
    (id: string) => {
      dismissOpenTaskSwipe();
      pemSelection();
      if (isCreating) dismissCreateRow();
      setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
    },
    [isCreating, dismissCreateRow],
  );

  const handleEditTask = useCallback(
    (item: ApiExtract) => {
      if (isCreating) dismissCreateRow();
      onEditTask(item);
    },
    [isCreating, dismissCreateRow, onEditTask],
  );

  const handleCloseTask = useCallback(
    (id: string) => {
      if (isCreating) dismissCreateRow();
      onCloseTask(id);
    },
    [isCreating, dismissCreateRow, onCloseTask],
  );

  const handleCreate = useCallback(async () => {
    cancelBlurDismissTimer();
    const name = newListName.trim();
    if (!name) {
      dismissCreateRow();
      return;
    }
    isSubmittingListRef.current = true;
    setIsSubmittingList(true);
    try {
      await onAddList(name);
      setNewListName("");
      setIsCreating(false);
      Keyboard.dismiss();
    } catch {
      Alert.alert(
        "Couldn’t create list",
        "Check your connection and try again.",
      );
    } finally {
      isSubmittingListRef.current = false;
      setIsSubmittingList(false);
    }
  }, [newListName, onAddList, cancelBlurDismissTimer, dismissCreateRow]);

  const handleLongPressDelete = useCallback(
    (list: ApiList) => {
      if (list.is_default) return;
      if (isCreating) dismissCreateRow();
      Alert.alert(
        `Delete "${list.name}"?`,
        "This will also delete all tasks in this list.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => onDeleteList(list.id),
          },
        ],
      );
    },
    [onDeleteList, isCreating, dismissCreateRow],
  );

  if (loading && lists.length === 0) {
    return (
      <View style={inboxStyles.center}>
        <ActivityIndicator color={pemAmber} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={local.keyboardRoot}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={
        Platform.OS === "ios"
          ? insets.top + KEYBOARD_OFFSET_BELOW_SAFE_AREA
          : 0
      }
    >
      <ScrollView
        style={local.keyboardRoot}
        contentContainerStyle={local.scrollContent}
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={dismissOpenTaskSwipe}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={pemAmber}
          />
        }
      >
        <View style={local.scrollInner}>
          <Pressable
            disabled={!isCreating}
            onPress={dismissCreateRow}
            style={({ pressed }) => [
              local.headerRow,
              { borderBottomColor: colors.borderMuted },
              isCreating && pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={[local.headerTitle, { color: colors.textTertiary }]}>
              Lists
            </Text>
            <Pressable
              disabled={isSubmittingList}
              onPress={() => {
                cancelBlurDismissTimer();
                if (isCreating) {
                  dismissCreateRow();
                  return;
                }
                setNewListName("");
                setIsCreating(true);
                setTimeout(() => inputRef.current?.focus(), 100);
              }}
              hitSlop={8}
            >
              <Plus size={20} color={pemAmber} />
            </Pressable>
          </Pressable>

          {isCreating ? (
            <View
              style={[local.newListRow, { borderBottomColor: colors.borderMuted }]}
              onStartShouldSetResponder={() => true}
            >
              {isSubmittingList ? (
                <View style={local.savingRow}>
                  <ActivityIndicator color={pemAmber} />
                  <Text
                    style={[local.savingLabel, { color: colors.textSecondary }]}
                  >
                    Saving…
                  </Text>
                </View>
              ) : (
                <TextInput
                  ref={inputRef}
                  style={[local.newListInput, { color: colors.textPrimary }]}
                  value={newListName}
                  onChangeText={setNewListName}
                  placeholder="List name..."
                  placeholderTextColor={colors.placeholder}
                  autoFocus
                  onSubmitEditing={handleCreate}
                  onFocus={cancelBlurDismissTimer}
                  onBlur={() => {
                    if (isSubmittingListRef.current) return;
                    blurDismissTimerRef.current = setTimeout(() => {
                      blurDismissTimerRef.current = null;
                      dismissCreateRow();
                    }, CREATE_ROW_BLUR_DISMISS_MS);
                  }}
                  returnKeyType="done"
                  blurOnSubmit
                />
              )}
            </View>
          ) : null}

          <Pressable
            disabled={!isCreating}
            onPress={dismissCreateRow}
            style={local.dismissBackdrop}
          >
            <View style={local.listBlock}>
              {sortedLists.map((list) => (
                <ListSectionRow
                  key={list.id}
                  list={list}
                  items={grouped[list.id] ?? []}
                  isOpen={collapsed[list.id] !== true}
                  onToggle={toggle}
                  onCloseTask={handleCloseTask}
                  onEditTask={handleEditTask}
                  onLongPress={
                    list.is_default ? undefined : () => handleLongPressDelete(list)
                  }
                  colors={colors}
                />
              ))}

              {sortedLists.length === 0 && !isCreating ? (
                <Text style={[local.emptyHint, { color: colors.textTertiary }]}>
                  No lists yet
                </Text>
              ) : null}
            </View>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ListSectionRow({
  list,
  items,
  isOpen,
  onToggle,
  onCloseTask,
  onEditTask,
  onLongPress,
  colors,
}: {
  list: ApiList;
  items: ApiExtract[];
  isOpen: boolean;
  onToggle: (id: string) => void;
  onCloseTask: (id: string) => void;
  onEditTask: (item: ApiExtract) => void;
  onLongPress?: () => void;
  colors: Record<string, string>;
}) {
  const Chevron = isOpen ? ChevronDown : ChevronRight;

  return (
    <View>
      <Pressable
        onPress={() => onToggle(list.id)}
        onLongPress={onLongPress}
        style={[inboxStyles.sectionHeader, { borderBottomColor: colors.borderMuted }]}
      >
        <List size={16} color={pemAmber} />
        <View style={local.titleBlock}>
          <Text
            style={[
              inboxStyles.sectionTitle,
              { color: colors.textPrimary, flexShrink: 1 },
            ]}
            numberOfLines={1}
          >
            {list.name}
          </Text>
          {list.is_default ? (
            <View
              style={[
                local.defaultBadge,
                { backgroundColor: colors.secondarySurface },
              ]}
            >
              <Text
                style={[local.defaultBadgeText, { color: colors.textTertiary }]}
              >
                Default
              </Text>
            </View>
          ) : null}
        </View>
        <Chevron size={16} color={colors.textTertiary} />
      </Pressable>
      {isOpen &&
        (items.length > 0 ? (
          <InboxSectionItemsGroup>
            {items.map((item) => (
              <TaskItem
                key={item.id}
                item={item}
                onCloseTask={onCloseTask}
                onEditPress={onEditTask}
                compact
              />
            ))}
          </InboxSectionItemsGroup>
        ) : (
          <Text style={[local.emptyHint, { color: colors.textTertiary }]}>
            No tasks in this list
          </Text>
        ))}
    </View>
  );
}

const local = StyleSheet.create({
  keyboardRoot: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: space[10],
  },
  scrollInner: {
    flexGrow: 1,
  },
  dismissBackdrop: {
    flexGrow: 1,
  },
  listBlock: {
    flexGrow: 1,
  },
  titleBlock: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    minWidth: 0,
  },
  defaultBadge: {
    paddingHorizontal: space[2],
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  defaultBadgeText: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.xs,
    letterSpacing: 0.3,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: space[2],
    paddingHorizontal: space[4],
    marginTop: space[2],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.xs,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  emptyHint: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.sm,
    paddingHorizontal: space[4],
    paddingLeft: space[8],
    paddingVertical: space[3],
  },
  newListRow: {
    paddingHorizontal: space[4],
    paddingVertical: space[2],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  newListInput: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.base,
    paddingVertical: space[2],
  },
  savingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingVertical: space[3],
  },
  savingLabel: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.sm,
  },
});
