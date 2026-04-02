import { useTheme } from "@/contexts/ThemeContext";
import { pemImpactLight } from "@/lib/pemHaptics";
import { space } from "@/constants/typography";
import { ArrowUp } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";

type Props = {
  canSend: boolean;
  sendActive: boolean;
  onSend: () => void;
  submitting?: boolean;
};

/**
 * Send-only control for text dumps (matches prior circular send affordance).
 */
export default function DumpBottomBar({
  canSend,
  sendActive,
  onSend,
  submitting = false,
}: Props) {
  const { colors, resolved } = useTheme();
  const ctrlSurface = resolved === "dark" ? colors.secondarySurface : colors.cardBackground;

  return (
    <View style={styles.bottom}>
      <View style={styles.row}>
        <View style={styles.spacer} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send dump to Pem"
          onPress={() => {
            pemImpactLight();
            onSend();
          }}
          disabled={submitting || !canSend}
          style={({ pressed }) => [
            styles.sendCircle,
            {
              backgroundColor: sendActive ? colors.pemAmber : ctrlSurface,
              borderColor: sendActive ? colors.pemAmber : colors.borderMuted,
              opacity: submitting || !canSend ? 0.55 : pressed ? 0.92 : 1,
            },
          ]}
        >
          <ArrowUp
            size={22}
            color={sendActive ? colors.onPrimary : colors.textSecondary}
            strokeWidth={2.5}
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bottom: {
    paddingHorizontal: space[4],
    paddingTop: space[2],
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  spacer: {
    flex: 1,
  },
  sendCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
