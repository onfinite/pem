import PrepDetailBody from "@/components/sections/prep-detail-sections/PrepDetailBody";
import PemText from "@/components/ui/PemText";
import { usePrepHub } from "@/contexts/PrepHubContext";
import { useTheme } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, lh, lineHeight, space } from "@/constants/typography";
import { router, useLocalSearchParams } from "expo-router";
import { Archive, X } from "lucide-react-native";
import { useEffect } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Full prep content — close returns to hub. */
export default function PrepDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getPrep, readyPreps, archivePrep } = usePrepHub();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const prep = typeof id === "string" ? getPrep(id) : undefined;

  useEffect(() => {
    if (typeof id === "string" && !getPrep(id)) {
      router.replace("/home");
    }
  }, [id, getPrep]);

  if (!prep) {
    return null;
  }

  const canArchive = readyPreps.some((p) => p.id === prep.id);

  const onArchive = () => {
    archivePrep(prep.id);
    router.back();
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: colors.pageBackground }]}>
      <View style={[styles.header, { paddingHorizontal: space[4] }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={({ pressed }) => [
            styles.headerCtrl,
            pressed && { opacity: 0.75 },
          ]}
        >
          <X size={22} stroke={colors.textSecondary} strokeWidth={2} />
        </Pressable>
        {canArchive ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Archive ${prep.title}`}
            onPress={onArchive}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={({ pressed }) => [
              styles.headerCtrl,
              styles.archiveCtrl,
              {
                borderColor: colors.borderMuted,
                backgroundColor: colors.secondarySurface,
                opacity: pressed ? 0.88 : 1,
              },
            ]}
          >
            <Archive size={22} stroke={colors.pemAmber} strokeWidth={2} />
          </Pressable>
        ) : (
          <View style={styles.headerCtrl} />
        )}
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingHorizontal: space[4],
            paddingBottom: Math.max(insets.bottom, space[6]),
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <PemText style={[styles.tag, { color: colors.pemAmber }]}>{prep.tag}</PemText>
        <PemText style={[styles.title, { color: colors.textPrimary }]}>{prep.title}</PemText>
        <PrepDetailBody prep={prep} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
    marginBottom: space[2],
  },
  /** Same outer box for close, archive, and placeholder — keeps icons aligned. */
  headerCtrl: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  archiveCtrl: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  scroll: {
    gap: space[4],
    paddingTop: space[1],
  },
  tag: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.xs,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  title: {
    fontFamily: fontFamily.display.semibold,
    fontSize: fontSize.xxl,
    lineHeight: lh(fontSize.xxl, lineHeight.snug),
    letterSpacing: -0.3,
  },
});
