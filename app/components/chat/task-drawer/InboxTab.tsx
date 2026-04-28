import { error as errorRed, pemAmber } from "@/constants/theme";
import { fontFamily, fontSize, space, radii } from "@/constants/typography";
import { useTheme } from "@/contexts/ThemeContext";
import type { ApiExtract } from "@/lib/pemApi";
import { pemSelection } from "@/lib/pemHaptics";
import { AlertTriangle, CalendarDays, Pause, RefreshCw } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { InboxLabeledSection } from "@/components/chat/task-drawer/InboxLabeledSection";
import { inboxStyles } from "@/components/chat/task-drawer/inboxTab.styles";
import { partitionInboxTasks } from "@/components/chat/task-drawer/partitionInboxTasks";
import { dismissOpenTaskSwipe } from "@/components/chat/task-drawer/taskSwipeRegistry";

export function InboxTab({
  tasks,
  loading,
  hasError,
  onCloseTask,
  onInboxScroll,
  onEditTask,
  onRetry,
  onRefresh,
  refreshing,
}: {
  tasks: ApiExtract[];
  loading: boolean;
  hasError: boolean;
  onCloseTask: (id: string) => void;
  onInboxScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onEditTask: (item: ApiExtract) => void;
  onRetry: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const { colors } = useTheme();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    holding: true,
  });

  const parts = useMemo(() => partitionInboxTasks(tasks), [tasks]);

  const toggleSection = useCallback((key: string) => {
    dismissOpenTaskSwipe();
    pemSelection();
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const hasAny = parts.sections.length + parts.holding.length > 0;

  if (loading && tasks.length === 0) {
    return (
      <View style={inboxStyles.center}>
        <ActivityIndicator color={pemAmber} />
      </View>
    );
  }

  if (hasError && tasks.length === 0) {
    return (
      <View style={inboxStyles.center}>
        <Text style={[local.errorText, { color: colors.textTertiary }]}>
          {`Couldn't load tasks`}
        </Text>
        <Pressable
          style={[local.retryBtn, { backgroundColor: colors.secondarySurface }]}
          onPress={onRetry}
        >
          <RefreshCw size={14} color={colors.textSecondary} />
          <Text style={[local.retryLabel, { color: colors.textSecondary }]}>
            Try again
          </Text>
        </Pressable>
      </View>
    );
  }

  if (!hasAny) {
    return (
      <View style={inboxStyles.center}>
        <Text style={[inboxStyles.emptyText, { color: colors.textTertiary }]}>
          No open tasks. You are all caught up.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: space[4] }}
      showsVerticalScrollIndicator={false}
      onScrollBeginDrag={dismissOpenTaskSwipe}
      onScroll={onInboxScroll}
      scrollEventThrottle={400}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={pemAmber}
        />
      }
    >
      {parts.sections.map((s) => {
        const isOverdue = s.key === "overdue";
        return (
          <InboxLabeledSection
            key={s.key}
            sectionKey={s.key}
            title={s.label}
            Icon={isOverdue ? AlertTriangle : CalendarDays}
            iconColor={isOverdue ? errorRed : pemAmber}
            titleColor={isOverdue ? errorRed : undefined}
            countColor={isOverdue ? errorRed : undefined}
            items={s.items}
            isOpen={collapsed[s.key] !== true}
            onToggle={toggleSection}
            onCloseTask={onCloseTask}
            onEditTask={onEditTask}
          />
        );
      })}

      <InboxLabeledSection
        sectionKey="holding"
        title="Holding"
        Icon={Pause}
        items={parts.holding}
        isOpen={!collapsed.holding}
        onToggle={toggleSection}
        onCloseTask={onCloseTask}
        onEditTask={onEditTask}
      />
    </ScrollView>
  );
}

const local = StyleSheet.create({
  errorText: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.sm,
    marginBottom: space[3],
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: space[4],
    paddingVertical: space[2],
    borderRadius: radii.md,
  },
  retryLabel: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.sm,
  },
});
