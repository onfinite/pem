import ScreenScroll from "@/components/layout/ScreenScroll";
import PemButton from "@/components/ui/PemButton";
import PemText from "@/components/ui/PemText";
import { useTheme, type ThemePreference } from "@/contexts/ThemeContext";
import { pemAmber } from "@/constants/theme";
import { fontFamily, fontSize, lh, lineHeight, radii, space } from "@/constants/typography";
import { useClerk, useUser } from "@clerk/expo";
import { router } from "expo-router";
import { Check, Monitor, Moon, Sun, UserRound, X } from "lucide-react-native";
import { useCallback } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  View,
} from "react-native";

const THEME_OPTIONS: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

export default function SettingsScreen() {
  const { colors, preference, setPreference, resolved } = useTheme();
  const { user } = useUser();
  const { signOut } = useClerk();

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
    <ScreenScroll contentStyle={styles.scrollContent}>
      <View style={styles.topBar}>
        <PemText variant="titleLarge" style={styles.screenTitle}>
          Settings
        </PemText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close settings"
          onPress={onClose}
          hitSlop={12}
          style={styles.closeBtn}
        >
          <X size={24} stroke={colors.textSecondary} strokeWidth={2} />
        </Pressable>
      </View>

      <PemText variant="label" style={styles.sectionLabel}>
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
          {user?.imageUrl ? (
            <Image source={{ uri: user.imageUrl }} style={styles.avatar} />
          ) : (
            <View
              style={[
                styles.avatarPlaceholder,
                { backgroundColor: colors.brandMutedSurface },
              ]}
            >
              <UserRound size={28} stroke={colors.textSecondary} strokeWidth={2} />
            </View>
          )}
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
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: space[12],
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space[6],
  },
  screenTitle: {
    flex: 1,
  },
  closeBtn: {
    padding: space[2],
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
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[4],
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  avatarPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 36,
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
