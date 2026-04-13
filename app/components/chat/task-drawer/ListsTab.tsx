import { pemAmber } from "@/constants/theme";
import { fontFamily, fontSize, space, radii } from "@/constants/typography";
import { useTheme } from "@/contexts/ThemeContext";
import type { ApiExtract, ApiList } from "@/lib/pemApi";
import { pemSelection } from "@/lib/pemHaptics";
import {
  ChevronDown,
  ChevronRight,
  List,
  Plus,
} from "lucide-react-native";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { InboxSectionItemsGroup } from "./InboxSectionItemsGroup";
import { inboxStyles } from "./inboxTab.styles";
import { TaskItem } from "./TaskItem";

interface ListsTabProps {
  lists: ApiList[];
  tasks: ApiExtract[];
  loading: boolean;
  onDone: (id: string) => void;
  onEditTask: (item: ApiExtract) => void;
  onRefresh: () => void;
  refreshing: boolean;
  onAddList: (name: string) => Promise<void>;
  onDeleteList: (id: string) => Promise<void>;
}

export function ListsTab({
  lists, tasks, loading, onDone, onEditTask, onRefresh, refreshing,
  onAddList, onDeleteList,
}: ListsTabProps) {
  const { colors } = useTheme();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [isCreating, setIsCreating] = useState(false);
  const [newListName, setNewListName] = useState("");
  const inputRef = useRef<TextInput>(null);

  const defaultLists = useMemo(() => lists.filter((l) => l.is_default), [lists]);
  const customLists = useMemo(() => lists.filter((l) => !l.is_default), [lists]);

  const grouped = useMemo(() => {
    const byList: Record<string, ApiExtract[]> = {};
    for (const t of tasks) {
      const key = t.list_id ?? "__none__";
      if (!byList[key]) byList[key] = [];
      byList[key].push(t);
    }
    return byList;
  }, [tasks]);

  const toggle = useCallback((id: string) => {
    pemSelection();
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const handleCreate = useCallback(async () => {
    const name = newListName.trim();
    if (!name) return;
    setIsCreating(false);
    setNewListName("");
    await onAddList(name);
  }, [newListName, onAddList]);

  const handleLongPressDelete = useCallback(
    (list: ApiList) => {
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
    [onDeleteList],
  );

  if (loading && lists.length === 0) {
    return (
      <View style={inboxStyles.center}>
        <ActivityIndicator color={pemAmber} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: space[4] }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={pemAmber} />
      }
    >
      <SectionDivider title="Default Lists" colors={colors} />

      {defaultLists.map((list) => (
        <ListSectionRow
          key={list.id}
          list={list}
          items={grouped[list.id] ?? []}
          isOpen={collapsed[list.id] !== true}
          onToggle={toggle}
          onDone={onDone}
          onEditTask={onEditTask}
          colors={colors}
        />
      ))}

      <SectionDivider title="Custom Lists" colors={colors}>
        <Pressable
          onPress={() => { setIsCreating(true); setTimeout(() => inputRef.current?.focus(), 100); }}
          hitSlop={8}
        >
          <Plus size={18} color={pemAmber} />
        </Pressable>
      </SectionDivider>

      {isCreating && (
        <View style={[local.newListRow, { borderBottomColor: colors.borderMuted }]}>
          <TextInput
            ref={inputRef}
            style={[local.newListInput, { color: colors.textPrimary }]}
            value={newListName}
            onChangeText={setNewListName}
            placeholder="List name..."
            placeholderTextColor={colors.placeholder}
            autoFocus
            onSubmitEditing={handleCreate}
            onBlur={() => { if (!newListName.trim()) setIsCreating(false); }}
            returnKeyType="done"
          />
        </View>
      )}

      {customLists.length > 0 ? (
        customLists.map((list) => (
          <ListSectionRow
            key={list.id}
            list={list}
            items={grouped[list.id] ?? []}
            isOpen={collapsed[list.id] !== true}
            onToggle={toggle}
            onDone={onDone}
            onEditTask={onEditTask}
            onLongPress={handleLongPressDelete}
            colors={colors}
          />
        ))
      ) : (
        !isCreating && (
          <Text style={[local.emptyHint, { color: colors.textTertiary }]}>
            No lists added yet
          </Text>
        )
      )}
    </ScrollView>
  );
}

function SectionDivider({ title, colors, children }: {
  title: string;
  colors: Record<string, string>;
  children?: React.ReactNode;
}) {
  return (
    <View style={[local.divider, { borderBottomColor: colors.borderMuted }]}>
      <Text style={[local.dividerText, { color: colors.textTertiary }]}>{title}</Text>
      {children}
    </View>
  );
}

function ListSectionRow({ list, items, isOpen, onToggle, onDone, onEditTask, onLongPress, colors }: {
  list: ApiList;
  items: ApiExtract[];
  isOpen: boolean;
  onToggle: (id: string) => void;
  onDone: (id: string) => void;
  onEditTask: (item: ApiExtract) => void;
  onLongPress?: (list: ApiList) => void;
  colors: Record<string, string>;
}) {
  const Chevron = isOpen ? ChevronDown : ChevronRight;

  return (
    <View>
      <Pressable
        onPress={() => onToggle(list.id)}
        onLongPress={onLongPress ? () => onLongPress(list) : undefined}
        style={[inboxStyles.sectionHeader, { borderBottomColor: colors.borderMuted }]}
      >
        <List size={16} color={pemAmber} />
        <Text style={[inboxStyles.sectionTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {list.name}
        </Text>
        <Text style={[inboxStyles.sectionCount, { color: colors.textTertiary }]}>{items.length}</Text>
        <View style={{ flex: 1 }} />
        <Chevron size={16} color={colors.textTertiary} />
      </Pressable>
      {isOpen && (
        items.length > 0 ? (
          <InboxSectionItemsGroup>
            {items.map((item) => (
              <TaskItem key={item.id} item={item} onDone={onDone} onEditPress={onEditTask} compact />
            ))}
          </InboxSectionItemsGroup>
        ) : (
          <Text style={[local.emptyHint, { color: colors.textTertiary }]}>
            No tasks in this list
          </Text>
        )
      )}
    </View>
  );
}

const local = StyleSheet.create({
  divider: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: space[2],
    paddingHorizontal: space[4],
    marginTop: space[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dividerText: {
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
});
