import PemConfirmModal from "@/components/ui/PemConfirmModal";
import PemText from "@/components/ui/PemText";
import { usePrepHub } from "@/contexts/PrepHubContext";
import { useTheme } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, lh, lineHeight, radii, space } from "@/constants/typography";
import { success } from "@/constants/theme";
import { pemImpactLight, pemSelection } from "@/lib/pemHaptics";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { InteractionManager, Pressable, StyleSheet, View } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { Archive, ArchiveRestore, Trash2 } from "lucide-react-native";

const ACTION_W = 92;
const DELETE_MODAL_DELAY_MS = 220;

type Variant = "ready" | "archived";

type Props = {
  variant: Variant;
  children: ReactNode;
  prepId?: string;
  canDelete?: boolean;
  /** Gmail list rows — no rounded card chrome. */
  flat?: boolean;
  /** Multi-select mode — no swipe (row handles tap / long-press). */
  selectionMode?: boolean;
};

function deleteModalCopy(): { title: string; body: string; confirmLabel: string } {
  return {
    title: "Delete this prep?",
    body: "This can't be undone. Pem will remove it from your hub and stop any in-progress work for this prep.",
    confirmLabel: "Delete",
  };
}

/**
 * Gmail-style swipe: right → archive / restore, left → delete (confirm only).
 * Archive and restore apply immediately with hub undo snack; delete opens a confirm modal after the row closes.
 */
export default function HubSwipeableRow({
  variant,
  children,
  prepId,
  canDelete = true,
  flat = false,
  selectionMode = false,
}: Props) {
  const { colors } = useTheme();
  const { archivePrep, unarchivePrep, deletePrep } = usePrepHub();
  const ref = useRef<Swipeable | null>(null);
  const [deleteModal, setDeleteModal] = useState(false);
  const deleteModalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = useCallback(() => {
    ref.current?.close();
  }, []);

  const clearDeleteModalTimer = useCallback(() => {
    if (deleteModalTimerRef.current) {
      clearTimeout(deleteModalTimerRef.current);
      deleteModalTimerRef.current = null;
    }
  }, []);

  const commitArchive = useCallback(async () => {
    if (!prepId) return;
    close();
    pemImpactLight();
    try {
      await archivePrep(prepId);
    } catch {
      /* PrepHubContext surfaces errors */
    }
  }, [prepId, close, archivePrep]);

  const commitRestore = useCallback(async () => {
    if (!prepId) return;
    close();
    pemImpactLight();
    try {
      await unarchivePrep(prepId);
    } catch {
      /* PrepHubContext surfaces errors */
    }
  }, [prepId, close, unarchivePrep]);

  const scheduleDeleteModal = useCallback(() => {
    if (!canDelete) return;
    clearDeleteModalTimer();
    close();
    pemImpactLight();
    deleteModalTimerRef.current = setTimeout(() => {
      deleteModalTimerRef.current = null;
      setDeleteModal(true);
    }, DELETE_MODAL_DELAY_MS);
  }, [canDelete, clearDeleteModalTimer, close]);

  useEffect(() => () => clearDeleteModalTimer(), [clearDeleteModalTimer]);

  const onSwipeableOpen = useCallback(
    (direction: "left" | "right", swipeable: Swipeable) => {
      swipeable.close();
      if (direction === "left") {
        if (variant === "ready" && prepId) void commitArchive();
        else if (variant === "archived" && prepId) void commitRestore();
      } else if (direction === "right" && canDelete) {
        scheduleDeleteModal();
      }
    },
    [variant, canDelete, prepId, commitArchive, commitRestore, scheduleDeleteModal],
  );

  const handleConfirmDelete = useCallback(() => {
    setDeleteModal(false);
    pemSelection();
    if (!prepId) return;
    // Defer removal so Modal + Swipeable finish unmounting; immediate list delete + RNGH has crashed the app (no JS error).
    InteractionManager.runAfterInteractions(() => {
      setTimeout(() => {
        void deletePrep(prepId);
      }, 48);
    });
  }, [prepId, deletePrep]);

  const destructiveBg = colors.error;

  const renderLeft = useCallback(() => {
    if (variant === "ready") {
      return (
        <View style={[styles.actionRail, { backgroundColor: success }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Archive prep"
            onPress={commitArchive}
            style={({ pressed }) => [styles.actionInner, pressed && { opacity: 0.88 }]}
          >
            <Archive size={22} color={colors.onPrimary} strokeWidth={2.25} />
            <PemText style={[styles.actionLabel, { color: colors.onPrimary }]}>Archive</PemText>
          </Pressable>
        </View>
      );
    }
    return (
      <View style={[styles.actionRail, { backgroundColor: success }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Restore prep"
          onPress={commitRestore}
          style={({ pressed }) => [styles.actionInner, pressed && { opacity: 0.88 }]}
        >
          <ArchiveRestore size={22} color={colors.onPrimary} strokeWidth={2.25} />
          <PemText style={[styles.actionLabel, { color: colors.onPrimary }]}>Restore</PemText>
        </Pressable>
      </View>
    );
  }, [variant, colors, commitArchive, commitRestore]);

  const renderRight = useCallback(() => {
    return (
      <View style={[styles.actionRail, { backgroundColor: destructiveBg }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Delete prep"
          onPress={scheduleDeleteModal}
          style={({ pressed }) => [styles.actionInner, pressed && { opacity: 0.88 }]}
        >
          <Trash2 size={22} color={colors.onPrimary} strokeWidth={2.25} />
          <PemText style={[styles.actionLabel, { color: colors.onPrimary }]}>Delete</PemText>
        </Pressable>
      </View>
    );
  }, [colors, destructiveBg, scheduleDeleteModal]);

  const showRight = canDelete;

  const deleteCopy = deleteModalCopy();

  if (selectionMode) {
    return <View style={flat ? styles.foregroundFlat : styles.foreground}>{children}</View>;
  }

  return (
    <>
      <Swipeable
        ref={ref}
        friction={2}
        overshootFriction={8}
        leftThreshold={40}
        rightThreshold={40}
        activeOffsetX={[-24, 24]}
        renderLeftActions={renderLeft}
        renderRightActions={showRight ? renderRight : undefined}
        onSwipeableOpen={onSwipeableOpen}
        containerStyle={flat ? styles.swipeContainerFlat : styles.swipeContainer}
      >
        <View style={flat ? styles.foregroundFlat : styles.foreground}>{children}</View>
      </Swipeable>

      <PemConfirmModal
        visible={deleteModal}
        title={deleteCopy.title}
        body={deleteCopy.body}
        confirmLabel={deleteCopy.confirmLabel}
        confirmDestructive
        onCancel={() => {
          clearDeleteModalTimer();
          setDeleteModal(false);
        }}
        onConfirm={handleConfirmDelete}
      />
    </>
  );
}

const styles = StyleSheet.create({
  swipeContainer: {
    overflow: "hidden",
    borderRadius: radii.xl,
  },
  swipeContainerFlat: {
    overflow: "hidden",
    borderRadius: 0,
  },
  foreground: {
    borderRadius: radii.xl,
    overflow: "hidden",
  },
  foregroundFlat: {
    borderRadius: 0,
    overflow: "hidden",
  },
  actionRail: {
    width: ACTION_W,
    flex: 1,
    justifyContent: "center",
  },
  actionInner: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: space[1],
    paddingHorizontal: space[2],
  },
  actionLabel: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.xs,
    letterSpacing: 0.4,
    lineHeight: lh(fontSize.xs, lineHeight.snug),
  },
});
