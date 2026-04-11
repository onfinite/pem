import { useTheme } from "@/contexts/ThemeContext";
import { useLists } from "@/hooks/useLists";
import { pemImpactLight } from "@/lib/pemHaptics";
import { useAuth } from "@clerk/expo";
import { X } from "lucide-react-native";
import { forwardRef, type ForwardedRef, useCallback, useEffect } from "react";
import { Animated, Modal, type NativeScrollEvent, type NativeSyntheticEvent, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { InboxTab } from "./InboxTab";
import { ListsTab } from "./ListsTab";
import { TaskDrawerCalendarPanel } from "./TaskDrawerCalendarPanel";
import { TaskDrawerTabBar } from "./TaskDrawerTabBar";
import { TaskEditSheet } from "./TaskEditSheet";
import { UndoSnackbar } from "./UndoSnackbar";
import type { TaskDrawerHandle } from "./types";
import { taskDrawerViewStyles as styles } from "./taskDrawerView.styles";
import { useTaskDrawerController } from "./useTaskDrawerController";

const TaskDrawerView = forwardRef<
  TaskDrawerHandle,
  { onCountsChanged?: () => void }
>(function TaskDrawerView({ onCountsChanged }, ref) {
  const { colors } = useTheme();
  const { getToken } = useAuth();
  const insets = useSafeAreaInsets();
  const { lists, loadLists } = useLists();

  const c = useTaskDrawerController(
    ref as ForwardedRef<TaskDrawerHandle | null>,
    onCountsChanged,
    getToken,
  );

  useEffect(() => {
    if (c.visible) loadLists();
  }, [c.visible, loadLists]);

  const closeDrawer = () => {
    pemImpactLight();
    c.animateOut(() => c.setVisible(false));
  };

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      c.scrollOffset.current = e.nativeEvent.contentOffset.y;
      c.onInboxScroll(e);
    },
    [c],
  );

  if (!c.visible) return null;

  return (
    <Modal
      transparent
      visible
      animationType="none"
      onRequestClose={closeDrawer}
    >
      <Animated.View
        style={[
          styles.drawer,
          {
            paddingBottom: insets.bottom,
            backgroundColor: colors.pageBackground,
            transform: [{ translateY: c.translateY }],
          },
        ]}
      >
        <View style={{ height: insets.top + 20 }} />

        <View style={styles.headerRow}>
          <TaskDrawerTabBar
          tab={c.tab}
          taskCount={c.tasks.length}
          dayItemCount={c.dayItems.length}
          selectedDate={c.selectedDate}
          colors={colors}
          onTabSwitch={c.handleTabSwitch}
          />

          <Pressable
            onPress={closeDrawer}
            style={[styles.closeBtn, { backgroundColor: colors.secondarySurface }]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <X size={18} color={colors.textSecondary} strokeWidth={2.5} />
          </Pressable>
        </View>

        <View style={styles.drawerBody}>
          {c.tab === "calendar" && (
            <TaskDrawerCalendarPanel
              calData={c.calData}
              calLoading={c.calLoading}
              calError={c.calError}
              selectedDate={c.selectedDate}
              markedDates={c.markedDates}
              dayItems={c.dayItems}
              calendarTheme={c.calendarTheme}
              onDayPress={c.onDayPress}
              onMonthChange={c.onMonthChange}
              onDone={c.handleDone}
              onEditTask={c.openTaskEdit}
              onRetry={() => c.handleTabSwitch("calendar")}
              onRefresh={c.handleRefresh}
              refreshing={c.refreshing}
            />
          )}

          {c.tab === "inbox" && (
            <InboxTab
              tasks={c.tasks}
              loading={c.tasksLoading}
              hasError={c.tasksError}
              onDone={c.handleDone}
              doneItems={c.doneItems}
              doneLoading={c.doneLoading}
              doneHasMore={c.doneHasMore}
              doneLoadingMore={c.doneLoadingMore}
              onInboxScroll={handleScroll}
              onEditTask={c.openTaskEdit}
              onRetry={() => c.handleTabSwitch("inbox")}
              onRefresh={c.handleRefresh}
              refreshing={c.refreshing}
            />
          )}

          {c.tab === "lists" && (
            <ListsTab
              lists={lists}
              tasks={c.tasks}
              loading={c.tasksLoading}
              onDone={c.handleDone}
              onEditTask={c.openTaskEdit}
              onRefresh={c.handleRefresh}
              refreshing={c.refreshing}
            />
          )}
        </View>
        <UndoSnackbar
          item={c.undoItem}
          onUndo={c.handleUndo}
          onExpire={c.handleUndoExpire}
        />
      </Animated.View>

      <TaskEditSheet
        visible={c.editVisible}
        extract={c.editExtract}
        lists={lists}
        onClose={c.closeTaskEdit}
        onSave={c.handleEditSave}
        onDone={c.handleEditDone}
        onDismiss={c.handleEditDismiss}
        onDelete={c.handleEditDelete}
      />
    </Modal>
  );
});

export default TaskDrawerView;
