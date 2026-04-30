import { useTheme } from "@/contexts/ThemeContext";
import { useLists } from "@/hooks/shared/useLists";
import { pemImpactLight } from "@/lib/pemHaptics";
import { useAuth } from "@clerk/expo";
import { X } from "lucide-react-native";
import { forwardRef, type ForwardedRef, useCallback, useEffect } from "react";
import { Animated, Modal, type NativeScrollEvent, type NativeSyntheticEvent, Pressable, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TaskDrawerCalendarPanel } from "@/components/drawer/calendar/TaskDrawerCalendarPanel";
import { TaskEditSheet } from "@/components/drawer/edit/TaskEditSheet";
import { UndoSnackbar } from "@/components/drawer/feedback/UndoSnackbar";
import type { TaskDrawerHandle } from "@/components/drawer/types";
import { dismissOpenTaskSwipe } from "@/components/drawer/task-item/taskSwipeRegistry";
import { InboxTab } from "@/components/drawer/tabs/InboxTab";
import { ListsTab } from "@/components/drawer/tabs/ListsTab";
import { TaskDrawerTabBar } from "@/components/drawer/tabs/TaskDrawerTabBar";
import { taskDrawerViewStyles as styles } from "@/components/drawer/tabs/taskDrawerView.styles";
import { useTaskDrawerController } from "@/hooks/drawer/useTaskDrawerController";

const TaskDrawerView = forwardRef<
  TaskDrawerHandle,
  { onCountsChanged?: (removedId: string) => void }
>(function TaskDrawerView({ onCountsChanged }, ref) {
  const { colors } = useTheme();
  const { getToken } = useAuth();
  const insets = useSafeAreaInsets();
  const { lists, loadLists, addList, removeList } = useLists();

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
    dismissOpenTaskSwipe();
    c.animateOut(() => c.setVisible(false));
  };

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      c.scrollOffset.current = e.nativeEvent.contentOffset.y;
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
      <GestureHandlerRootView style={styles.modalGestureRoot}>
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
        <View style={{ height: insets.top + 4 }} />

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
              onCloseTask={c.handleClose}
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
              onCloseTask={c.handleClose}
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
              onCloseTask={c.handleClose}
              onEditTask={c.openTaskEdit}
              onRefresh={async () => {
                await Promise.all([
                  c.handleRefresh(),
                  loadLists(),
                ]);
              }}
              refreshing={c.refreshing}
              onAddList={addList}
              onDeleteList={async (id) => {
                c.removeTasksByListId(id);
                await removeList(id);
              }}
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
        onCloseTask={c.handleEditClose}
      />
      </GestureHandlerRootView>
    </Modal>
  );
});

export default TaskDrawerView;
