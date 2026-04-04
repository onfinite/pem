import {
  glassChromeBorder,
  TOP_BAR_ROW_PAD,
  TOP_ICON_CHIP,
} from "@/components/sections/home-sections/homeLayout";
import PemButton from "@/components/ui/PemButton";
import PemText from "@/components/ui/PemText";
import { useTheme, type ThemePreference } from "@/contexts/ThemeContext";
import { pemAmber } from "@/constants/theme";
import { fontFamily, fontSize, lh, lineHeight, radii, space } from "@/constants/typography";
import { useClerk, useUser } from "@clerk/expo";
import { router } from "expo-router";
import { Bookmark, Check, ChevronRight, Monitor, Moon, Sun, UserRound, X } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import {
  initialWindowMetrics,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

const THEME_OPTIONS: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

/**
 * Same idea as `prep/[id].tsx` and dump: manual top inset on the root (no `ScreenScroll` /
 * `SafeAreaView`). During a native-stack push, `useSafeAreaInsets()` can report `top: 0` for a frame;
 * fall back to `initialWindowMetrics` so the first paint matches later frames.
 */
export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const topInset =
    insets.top > 0 ? insets.top : (initialWindowMetrics?.insets.top ?? 0);
  const { colors, preference, setPreference, resolved } = useTheme();
  const glassBorder = glassChromeBorder(resolved);
  const chipFill = colors.secondarySurface;
  const { user } = useUser();
  const { signOut } = useClerk();
  const [avatarDecoded, setAvatarDecoded] = useState(false);

  const imageUrl = user?.imageUrl;

  useEffect(() => {
    setAvatarDecoded(false);
  }, [imageUrl]);

  const email = user?.primaryEmailAddress?.emailAddress;
  const name =
    user?.fullName ||
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    "Your account";

  const onClose = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/home");
    }
  }, []);

  const onSignOut = useCallback(async () => {
    await signOut();
    router.replace("/welcome");
  }, [signOut]);

  return (
    <View
      style={[
        styles.screen,
        {
          backgroundColor: colors.pageBackground,
          paddingTop: topInset,
        },
      ]}
    >
      <View
        style={[
          styles.headerBackdrop,
          {
            backgroundColor: colors.pageBackground,
            borderBottomColor: glassBorder,
          },
          Platform.OS === "ios" && { borderCurve: "continuous" },
        ]}
      >
        <View style={[styles.headerInner, { paddingHorizontal: space[3] }]}>
          <View style={styles.headerRow}>
            <PemText
              accessibilityRole="header"
              numberOfLines={1}
              style={[styles.headerTitle, { color: colors.textPrimary }]}
            >
              Settings
            </PemText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close settings"
              onPress={onClose}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              style={({ pressed }) => [
                styles.headerHit,
                { opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <View
                style={[
                  styles.headerChip,
                  {
                    backgroundColor: chipFill,
                    borderColor: glassBorder,
                  },
                  Platform.select({
                    ios: {
                      shadowColor: "#000",
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: resolved === "dark" ? 0.2 : 0.06,
                      shadowRadius: 4,
                    },
                    android: { elevation: resolved === "dark" ? 2 : 2 },
                  }),
                ]}
              >
                <View style={styles.headerIconSlot}>
                  <X size={20} stroke={colors.textSecondary} strokeWidth={2} />
                </View>
              </View>
            </Pressable>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        {...(Platform.OS === "ios"
          ? { contentInsetAdjustmentBehavior: "never" as const }
          : {})}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingBottom: Math.max(insets.bottom, space[12]),
            paddingHorizontal: space[4],
          },
        ]}
      >
        <PemText variant="label" style={[styles.sectionLabel, styles.sectionLabelFirst]}>
          Profile
        </PemText>
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.cardBackground,
              borderColor: colors.borderMuted,
            },
          ]}
        >
          <View style={styles.profileRow}>
            <View
              style={[
                styles.avatarShell,
                { backgroundColor: colors.brandMutedSurface, borderColor: colors.borderMuted },
              ]}
            >
              {imageUrl ? (
                <Image
                  accessibilityIgnoresInvertColors
                  source={{ uri: imageUrl }}
                  style={[styles.avatarImage, { opacity: avatarDecoded ? 1 : 0 }]}
                  resizeMode="cover"
                  onLoad={() => setAvatarDecoded(true)}
                  onError={() => setAvatarDecoded(true)}
                />
              ) : null}
              {(!imageUrl || !avatarDecoded) && (
                <View style={styles.avatarFallback} pointerEvents="none">
                  {imageUrl && !avatarDecoded ? (
                    <ActivityIndicator color={colors.placeholder} />
                  ) : (
                    <UserRound size={28} stroke={colors.textSecondary} strokeWidth={2} />
                  )}
                </View>
              )}
            </View>
            <View style={styles.profileText}>
              <PemText variant="title" numberOfLines={1}>
                {name}
              </PemText>
              {email ? (
                <PemText variant="bodyMuted" numberOfLines={2}>
                  {email}
                </PemText>
              ) : (
                <PemText variant="bodyMuted">No email on file</PemText>
              )}
            </View>
          </View>
        </View>

        <PemText variant="label" style={styles.sectionLabel}>
          Pem memory
        </PemText>
        <PemText variant="caption" style={styles.sectionHint}>
          Facts Pem saves when prepping so answers fit you—not shared with others.
        </PemText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="What Pem knows about you"
          onPress={() => router.push("/settings/profile")}
          style={({ pressed }) => [pressed && { opacity: 0.92 }]}
        >
          <View
            style={[
              styles.card,
              styles.memoryCard,
              {
                backgroundColor: colors.cardBackground,
                borderColor: colors.borderMuted,
              },
              Platform.select({
                ios: {
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: resolved === "dark" ? 0.18 : 0.05,
                  shadowRadius: 8,
                },
                android: { elevation: 2 },
              }),
            ]}
          >
            <View style={[styles.memoryIconWell, { backgroundColor: colors.brandMutedSurface }]}>
              <Bookmark size={22} stroke={colors.pemAmber} strokeWidth={2} />
            </View>
            <View style={styles.memoryText}>
              <PemText variant="body" style={{ color: colors.textPrimary }}>
                What Pem knows about you
              </PemText>
              <PemText variant="caption" style={{ color: colors.textSecondary }}>
                View saved details
              </PemText>
            </View>
            <ChevronRight size={22} stroke={colors.textSecondary} strokeWidth={2} />
          </View>
        </Pressable>

        <PemText variant="label" style={styles.sectionLabel}>
          Appearance
        </PemText>
        <PemText variant="caption" style={styles.sectionHint}>
          Choose light, dark, or match your device. Currently using{" "}
          {resolved === "dark" ? "dark" : "light"}.
        </PemText>
        <View
          style={[
            styles.card,
            styles.themeCard,
            {
              backgroundColor: colors.cardBackground,
              borderColor: colors.borderMuted,
            },
          ]}
        >
          {THEME_OPTIONS.map(({ value, label, Icon }) => {
            const selected = preference === value;
            return (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`Theme ${label}`}
                onPress={() => setPreference(value)}
                style={({ pressed }) => [
                  styles.themeRow,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Icon size={20} stroke={colors.textSecondary} strokeWidth={2} />
                <PemText variant="body" style={styles.themeLabel}>
                  {label}
                </PemText>
                {selected ? (
                  <Check size={20} stroke={pemAmber} strokeWidth={2.5} />
                ) : (
                  <View style={styles.checkSpacer} />
                )}
              </Pressable>
            );
          })}
        </View>

        <View style={styles.signOutWrap}>
          <PemButton variant="secondary" size="md" onPress={onSignOut}>
            Sign out
          </PemButton>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  sectionLabelFirst: {
    marginTop: 0,
  },
  /** Matches `HomeTopBar` — display title + circular chip; X instead of settings icon. */
  headerBackdrop: {
    overflow: "hidden",
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: space[2],
  },
  headerInner: {
    paddingBottom: TOP_BAR_ROW_PAD,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space[3],
    minHeight: TOP_ICON_CHIP,
    paddingVertical: TOP_BAR_ROW_PAD,
  },
  headerTitle: {
    flex: 1,
    minWidth: 0,
    fontFamily: fontFamily.display.semibold,
    fontSize: fontSize.xl,
    lineHeight: lh(fontSize.xl, lineHeight.snug),
    letterSpacing: -0.3,
    textAlign: "left",
  },
  headerHit: {
    minWidth: 40,
    minHeight: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  headerChip: {
    width: TOP_ICON_CHIP,
    height: TOP_ICON_CHIP,
    borderRadius: TOP_ICON_CHIP / 2,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  headerIconSlot: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionLabel: {
    marginBottom: space[2],
    marginTop: space[2],
  },
  sectionHint: {
    marginBottom: space[4],
    opacity: 0.95,
  },
  card: {
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: space[5],
  },
  memoryCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[4],
    paddingVertical: space[4],
  },
  memoryIconWell: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  memoryText: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[4],
  },
  avatarShell: {
    width: 72,
    height: 72,
    borderRadius: 36,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImage: {
    ...StyleSheet.absoluteFillObject,
  },
  avatarFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  profileText: {
    flex: 1,
    gap: space[1],
  },
  themeCard: {
    padding: space[2],
    gap: 0,
  },
  themeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingVertical: space[4],
    paddingHorizontal: space[3],
    borderRadius: radii.md,
  },
  themeLabel: {
    flex: 1,
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.md,
    lineHeight: lh(fontSize.md, lineHeight.normal),
  },
  checkSpacer: {
    width: 20,
    height: 20,
  },
  signOutWrap: {
    marginTop: space[10],
    alignItems: "center",
  },
});
