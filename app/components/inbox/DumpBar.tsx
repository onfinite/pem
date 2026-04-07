import PemText from "@/components/ui/PemText";
import { inboxChrome } from "@/constants/inboxChrome";
import { pemAmber } from "@/constants/theme";
import { fontSize, space } from "@/constants/typography";
import { pemImpactLight } from "@/lib/pemHaptics";
import { router } from "expo-router";
import { Mic } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  resolved: "light" | "dark";
};

export default function DumpBar({ resolved }: Props) {
  const insets = useSafeAreaInsets();
  const chrome = inboxChrome(resolved);

  return (
    <LinearGradient
      colors={[`${chrome.page}00`, chrome.page]}
      locations={[0, 0.45]}
      style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, space[4]) }]}
    >
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dump"
          onPress={() => {
            pemImpactLight();
            router.push("/dump");
          }}
          style={[styles.fab, { backgroundColor: pemAmber }]}
        >
          <Mic size={22} color="#fff" strokeWidth={2} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <PemText style={{ color: chrome.text, fontSize: fontSize.sm, fontWeight: "600" }}>Dump anything</PemText>
          <PemText style={{ color: chrome.textMuted, fontSize: fontSize.sm, fontWeight: "300", marginTop: 2 }}>
            on your mind. Pem organizes it.
          </PemText>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: space[5],
    paddingTop: space[4],
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
  },
  fab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
});
