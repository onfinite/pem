import { space } from "@/constants/typography";
import { useTheme } from "@/contexts/ThemeContext";
import { navigateMainTab } from "@/lib/mainTabNav";
import { pemImpactLight } from "@/lib/pemHaptics";
import { router, usePathname } from "expo-router";
import { CheckCircle2, ClipboardList, Mic, ScrollText } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import PemText from "@/components/ui/PemText";

export default function PemFloatingNav() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname() ?? "";

  if (
    pathname.includes("/dump") ||
    pathname.includes("/settings") ||
    pathname.includes("/welcome")
  ) {
    return null;
  }

  const onInbox = pathname.includes("/inbox");
  const onThoughts = pathname.includes("/thoughts");
  const onDone = pathname.includes("/done");

  const tabColor = (active: boolean) =>
    active ? colors.pemAmber : colors.textSecondary;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, space[2]) }]}
    >
      <View style={styles.column}>
        <View style={styles.fabRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dump"
            onPress={() => {
              pemImpactLight();
              router.push("/dump");
            }}
            style={[styles.fab, { backgroundColor: colors.pemAmber }]}
          >
            <Mic size={26} color="#fff" strokeWidth={2} />
          </Pressable>
        </View>

        <View style={[styles.bar, { backgroundColor: colors.cardBackground }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Inbox"
            onPress={() => {
              pemImpactLight();
              navigateMainTab(pathname, "/inbox", router.replace);
            }}
            style={styles.tab}
          >
            <ClipboardList size={22} color={tabColor(onInbox)} strokeWidth={2} />
            <PemText
              variant="caption"
              style={{ color: tabColor(onInbox), marginTop: 2 }}
            >
              Inbox
            </PemText>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Thoughts"
            onPress={() => {
              pemImpactLight();
              navigateMainTab(pathname, "/thoughts", router.replace);
            }}
            style={styles.tab}
          >
            <ScrollText size={22} color={tabColor(onThoughts)} strokeWidth={2} />
            <PemText
              variant="caption"
              style={{ color: tabColor(onThoughts), marginTop: 2 }}
            >
              Thoughts
            </PemText>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Done"
            onPress={() => {
              pemImpactLight();
              navigateMainTab(pathname, "/done", router.replace);
            }}
            style={styles.tab}
          >
            <CheckCircle2 size={22} color={tabColor(onDone)} strokeWidth={2} />
            <PemText
              variant="caption"
              style={{ color: tabColor(onDone), marginTop: 2 }}
            >
              Done
            </PemText>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
  },
  column: {
    maxWidth: 400,
    width: "92%",
    alignItems: "stretch",
  },
  fabRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: space[2],
  },
  bar: {
    zIndex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    borderRadius: 999,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    minHeight: 56,
    width: "100%",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  tab: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 80,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 12,
  },
});
