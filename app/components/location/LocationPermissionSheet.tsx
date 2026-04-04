import PemButton from "@/components/ui/PemButton";
import PemText from "@/components/ui/PemText";
import { useTheme } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, lh, lineHeight, radii, space } from "@/constants/typography";
import { pemImpactLight } from "@/lib/pemHaptics";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type LocationPermissionSheetProps = {
  visible: boolean;
  title: string;
  bodyPrimary: string;
  bodySecondary: string;
  onAllow: () => void | Promise<void>;
  onNotNow: () => void | Promise<void>;
};

/**
 * Pem explainer before the system location dialog (two-step flow per product rules).
 */
export default function LocationPermissionSheet({
  visible,
  title,
  bodyPrimary,
  bodySecondary,
  onAllow,
  onNotNow,
}: LocationPermissionSheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => {
        pemImpactLight();
        void onNotNow();
      }}
    >
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => {
            pemImpactLight();
            void onNotNow();
          }}
        />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.cardBackground,
              borderColor: colors.borderMuted,
              paddingBottom: Math.max(insets.bottom, space[4]),
            },
          ]}
        >
          <PemText style={[styles.title, { color: colors.textPrimary }]}>{title}</PemText>
          <PemText style={[styles.body, { color: colors.textSecondary }]}>{bodyPrimary}</PemText>
          <PemText style={[styles.bodyMuted, { color: colors.textTertiary }]}>{bodySecondary}</PemText>
          <View style={styles.actions}>
            <PemButton variant="secondary" onPress={() => void onNotNow()}>
              Not now
            </PemButton>
            <PemButton
              variant="primary"
              onPress={() => {
                void onAllow();
              }}
            >
              Allow location
            </PemButton>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space[5],
    paddingTop: space[5],
    gap: space[3],
  },
  title: {
    fontFamily: fontFamily.display.semibold,
    fontSize: fontSize.xl,
    lineHeight: lh(fontSize.xl, lineHeight.snug),
  },
  body: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.md,
    lineHeight: lh(fontSize.md, lineHeight.relaxed),
  },
  bodyMuted: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.sm,
    lineHeight: lh(fontSize.sm, lineHeight.relaxed),
  },
  actions: {
    flexDirection: "row",
    gap: space[3],
    marginTop: space[2],
  },
});
