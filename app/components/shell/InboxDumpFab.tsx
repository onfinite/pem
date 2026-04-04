import { INBOX_DUMP_FAB_SIZE, INBOX_FAB_GAP_ABOVE_TAB } from "@/components/sections/home-sections/homeLayout";
import { useInboxShell } from "@/constants/shellTokens";
import { pemImpactLight } from "@/lib/pemHaptics";
import { router } from "expo-router";
import { Plus } from "lucide-react-native";
import { Platform, Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Primary capture — bottom-right above the home indicator (hub uses drawer nav, no tab strip). */
export default function InboxDumpFab() {
  const s = useInboxShell();
  const insets = useSafeAreaInsets();

  const bottom = insets.bottom + INBOX_FAB_GAP_ABOVE_TAB;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="New dump"
      onPress={() => {
        pemImpactLight();
        router.push("/dump");
      }}
      style={({ pressed }) => [
        styles.fab,
        {
          bottom,
          width: INBOX_DUMP_FAB_SIZE,
          height: INBOX_DUMP_FAB_SIZE,
          borderRadius: INBOX_DUMP_FAB_SIZE / 2,
          backgroundColor: pressed ? s.amberDim : s.amber,
          ...Platform.select({
            ios: {
              shadowColor: s.amber,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.4,
              shadowRadius: 12,
            },
            android: { elevation: 8 },
          }),
        },
      ]}
    >
      <Plus size={22} color={s.fabIconOnAmber} strokeWidth={2.5} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    right: 20,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 30,
  },
});
