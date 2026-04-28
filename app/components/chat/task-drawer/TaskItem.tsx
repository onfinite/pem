import { pemAmber } from "@/constants/theme";
import { useTheme } from "@/contexts/ThemeContext";
import type { ApiExtract } from "@/lib/pemApi";
import { memo, useCallback, useEffect, useRef } from "react";
import Swipeable from "react-native-gesture-handler/Swipeable";
import { TaskItemRow } from "@/components/chat/task-drawer/TaskItemRow";
import { TaskItemSwipeClose } from "@/components/chat/task-drawer/TaskItemSwipeClose";
import {
  notifyTaskSwipeClosed,
  notifyTaskSwipeOpened,
  releaseTaskSwipe,
} from "@/components/chat/task-drawer/taskSwipeRegistry";
import { useTaskItemDisplay } from "@/components/chat/task-drawer/useTaskItemDisplay";

/** Same spring family as Swipeable’s `bounciness: 0` — do not mix `tension`/`friction` (RN invariant). */
const SWIPE_SPRING = {
  speed: 18,
  useNativeDriver: true,
} as const;

export const TaskItem = memo(function TaskItem({
  item,
  onCloseTask,
  compact,
  onEditPress,
}: {
  item: ApiExtract;
  onCloseTask: (id: string) => void;
  compact?: boolean;
  onEditPress: (item: ApiExtract) => void;
}) {
  const { colors } = useTheme();
  const meta = useTaskItemDisplay(item);
  const swipeRef = useRef<Swipeable>(null);

  const borderColor = meta.noManualComplete ? colors.textTertiary : pemAmber;

  const handleSwipeClose = useCallback(() => {
    swipeRef.current?.close();
    onCloseTask(item.id);
  }, [item.id, onCloseTask]);

  const renderRightActions = useCallback(
    () => <TaskItemSwipeClose onPress={handleSwipeClose} />,
    [handleSwipeClose],
  );

  useEffect(
    () => () => {
      const s = swipeRef.current;
      if (s) releaseTaskSwipe(s);
    },
    [],
  );

  return (
    <Swipeable
      ref={swipeRef}
      renderRightActions={renderRightActions}
      overshootRight={false}
      animationOptions={SWIPE_SPRING}
      onSwipeableOpen={(direction, row) => {
        if (direction === "right") notifyTaskSwipeOpened(row);
      }}
      onSwipeableClose={(_direction, row) => {
        notifyTaskSwipeClosed(row);
      }}
    >
      <TaskItemRow
        item={item}
        compact={compact}
        onEditPress={onEditPress}
        borderColor={borderColor}
        isOverdue={meta.isOverdue}
        timeStr={meta.timeStr}
        dateStr={meta.dateStr}
        urgencyLabel={meta.urgencyLabel}
        isCalendarBacked={meta.isCalendarBacked}
      />
    </Swipeable>
  );
});
