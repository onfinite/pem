import { pemAmber } from "@/constants/theme";
import { fontFamily, fontSize, radii, space } from "@/constants/typography";
import { useTheme } from "@/contexts/ThemeContext";
import { pemImpactLight } from "@/lib/pemHaptics";
import { Camera, Images } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type ChatImageSourceSheetProps = {
  visible: boolean;
  onRequestClose: () => void;
  onChooseCamera: () => void;
  onChoosePhotos: () => void;
};

/**
 * In-screen overlay (not `Modal`) so iOS can present the photo picker on the same
 * window; a nested RN `Modal` + deferred callbacks prevented the library from opening.
 */
export function ChatImageSourceSheet({
  visible,
  onRequestClose,
  onChooseCamera,
  onChoosePhotos,
}: ChatImageSourceSheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  if (!visible) return null;

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Pressable
        style={styles.scrim}
        onPress={onRequestClose}
        accessibilityLabel="Dismiss"
      />
      <View
        style={[
          styles.sheetWrap,
          { paddingBottom: Math.max(insets.bottom, space[4]) + space[2] },
        ]}
      >
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.cardBackground,
              borderColor: colors.borderMuted,
            },
          ]}
        >
          <Text style={[styles.title, { color: colors.textTertiary }]}>
            Add photo
          </Text>
          <View style={styles.row}>
            <Pressable
              onPress={() => {
                pemImpactLight();
                onChooseCamera();
              }}
              style={({ pressed }) => [
                styles.option,
                {
                  backgroundColor: colors.secondarySurface,
                  borderColor: colors.borderMuted,
                  opacity: pressed ? 0.88 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Take photo with camera"
            >
              <Camera size={32} color={pemAmber} strokeWidth={2} />
              <Text style={[styles.optionLabel, { color: colors.textPrimary }]}>
                Camera
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                pemImpactLight();
                onChoosePhotos();
              }}
              style={({ pressed }) => [
                styles.option,
                {
                  backgroundColor: colors.secondarySurface,
                  borderColor: colors.borderMuted,
                  opacity: pressed ? 0.88 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Choose from Photos"
            >
              <Images size={32} color={pemAmber} strokeWidth={2} />
              <Text style={[styles.optionLabel, { color: colors.textPrimary }]}>
                Photos
              </Text>
            </Pressable>
          </View>
          <Pressable
            onPress={onRequestClose}
            hitSlop={12}
            style={styles.cancelWrap}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Text style={[styles.cancel, { color: colors.textSecondary }]}>
              Cancel
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 200,
    elevation: 200,
    justifyContent: "flex-end",
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  sheetWrap: {
    paddingHorizontal: space[4],
  },
  sheet: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: space[4],
    paddingHorizontal: space[3],
    paddingBottom: space[2],
  },
  title: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.xs,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    textAlign: "center",
    marginBottom: space[3],
  },
  row: {
    flexDirection: "row",
    gap: space[3],
  },
  option: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: space[5],
    paddingHorizontal: space[2],
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: space[2],
  },
  optionLabel: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.md,
  },
  cancelWrap: {
    alignSelf: "center",
    marginTop: space[3],
    paddingVertical: space[2],
  },
  cancel: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.sm,
  },
});
