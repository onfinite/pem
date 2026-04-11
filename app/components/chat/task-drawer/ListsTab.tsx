import { pemAmber } from "@/constants/theme";
import { fontFamily, fontSize, space, radii } from "@/constants/typography";
import { useTheme } from "@/contexts/ThemeContext";
import type { ApiExtract, ApiList } from "@/lib/pemApi";
import { pemSelection } from "@/lib/pemHaptics";
import { ChevronDown, ChevronRight, List } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { TaskItem } from "./TaskItem";

export function ListsTab({
  lists,
  tasks,
  loading,
  onDone,
  onEditTask,
  onRefresh,
  refreshing,
}: {
  lists: ApiList[];
  tasks: ApiExtract[];
  loading: boolean;
  onDone: (id: string) => void;
  onEditTask: (item: ApiExtract) => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const { colors } = useTheme();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

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

  if (loading && lists.length === 0) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={pemAmber} />
      </View>
    );
  }

  if (lists.length === 0) {
    return (
      <View style={s.center}>
        <Text style={[s.emptyText, { color: colors.textTertiary }]}>
          No lists yet. Assign tasks to a list to see them here.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: space[4] }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={pemAmber}
        />
      }
    >
      {lists.map((list) => {
        const items = grouped[list.id] ?? [];
        const isOpen = collapsed[list.id] !== true;
        const Chevron = isOpen ? ChevronDown : ChevronRight;

        return (
          <View key={list.id}>
            <Pressable
              style={[s.header, { borderBottomColor: colors.borderMuted }]}
              onPress={() => toggle(list.id)}
              accessibilityRole="button"
            >
              <List size={14} color={colors.textSecondary} />
              <Text
                style={[s.headerText, { color: colors.textPrimary }]}
                numberOfLines={1}
              >
                {list.name}
              </Text>
              <Text style={[s.count, { color: colors.textTertiary }]}>
                {items.length}
              </Text>
              <Chevron size={16} color={colors.textTertiary} />
            </Pressable>

            {isOpen &&
              (items.length > 0 ? (
                items.map((item) => (
                  <TaskItem
                    key={item.id}
                    item={item}
                    onDone={onDone}
                    onEditPress={onEditTask}
                    compact
                  />
                ))
              ) : (
                <Text style={[s.emptySection, { color: colors.textTertiary }]}>
                  No tasks in this list
                </Text>
              ))}
          </View>
        );
      })}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: space[5],
  },
  emptyText: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.sm,
    textAlign: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerText: {
    flex: 1,
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.base,
  },
  count: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.sm,
  },
  emptySection: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.sm,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
});
