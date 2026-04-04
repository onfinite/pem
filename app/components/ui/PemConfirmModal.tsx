import PemButton from "@/components/ui/PemButton";
import PemText from "@/components/ui/PemText";
import { useTheme } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, lh, lineHeight, radii, space } from "@/constants/typography";
import { pemImpactLight } from "@/lib/pemHaptics";
import { Modal, Pressable, StyleSheet, View } from "react-native";

export type PemConfirmModalProps = {
  visible: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
};

/**
 * Centered confirm sheet — same chrome as prep detail archive/delete.
 */
export default function PemConfirmModal({
  visible,
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: PemConfirmModalProps) {
  const { colors } = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        pemImpactLight();
        onCancel();
      }}
    >
      <Pressable
        style={[styles.modalBackdrop, { backgroundColor: "rgba(0,0,0,0.45)" }]}
        onPress={() => {
          pemImpactLight();
          onCancel();
        }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[styles.modalCard, { backgroundColor: colors.cardBackground, borderColor: colors.borderMuted }]}
        >
          <PemText style={[styles.modalTitle, { color: colors.textPrimary }]}>{title}</PemText>
          <PemText style={[styles.modalBody, { color: colors.textSecondary }]}>{body}</PemText>
          <View style={styles.modalActions}>
            <PemButton
              variant="secondary"
              onPress={() => {
                pemImpactLight();
                onCancel();
              }}
            >
              Cancel
            </PemButton>
            <PemButton
              onPress={() => {
                void onConfirm();
              }}
            >
              {confirmLabel}
            </PemButton>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: space[6],
  },
  modalCard: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space[5],
    gap: space[4],
  },
  modalTitle: {
    fontFamily: fontFamily.display.semibold,
    fontSize: fontSize.xl,
    lineHeight: lh(fontSize.xl, lineHeight.snug),
  },
  modalBody: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.md,
    lineHeight: lh(fontSize.md, lineHeight.relaxed),
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: space[3],
    flexWrap: "wrap",
  },
});
