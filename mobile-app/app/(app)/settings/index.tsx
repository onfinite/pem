import {
  glassChromeBorder,
  TOP_BAR_ROW_PAD,
  TOP_ICON_CHIP,
} from "@/constants/layout";
import CalendarSection from "@/components/settings/CalendarSection";
import PemButton from "@/components/ui/PemButton";
import PemText from "@/components/ui/PemText";
import { useTheme, type ThemePreference } from "@/contexts/ThemeContext";
import { pemAmber } from "@/constants/theme";
import { fontFamily, fontSize, lh, lineHeight, radii, space } from "@/constants/typography";
import {
  deleteAccount,
  getMe,
  getUserSummary,
  setNotificationTime,
  updateUserSummary,
} from "@/services/api/pemApi";
import { openExternalUrl } from "@/services/links/openExternalUrl";
import {
  mergeSettingsScreenCache,
  readSettingsScreenCache,
} from "@/services/cache/settingsScreenCache";
import { useAuth, useClerk, useUser } from "@clerk/expo";
import { router } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  Bell,
  Check,
  ChevronRight,
  Monitor,
  Moon,
  Sun,
  UserRound,
  X,
} from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
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

function formatTime12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function hhmmToDate(hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

function dateToHhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const SUMMARY_MAX_CHARS = 2000;

function SummaryCard() {
  const { colors } = useTheme();
  const { getToken, userId } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const [summary, setSummary] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (userId) {
        const snap = await readSettingsScreenCache(userId);
        if (!cancelled && snap) setSummary(snap.summary);
      }
      try {
        const r = await getUserSummary(getTokenRef.current);
        if (!cancelled) {
          setSummary(r.summary);
          if (userId) {
            await mergeSettingsScreenCache(userId, { summary: r.summary });
          }
        }
      } catch {
        /* keep cache / prior state */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const handleOpen = useCallback(() => {
    setDraft(summary ?? "");
    setOpen(true);
  }, [summary]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await updateUserSummary(getTokenRef.current, draft);
      setSummary(draft);
      setOpen(false);
      if (userId) await mergeSettingsScreenCache(userId, { summary: draft });
    } catch { /* ignore */ }
    setSaving(false);
  }, [draft, userId]);

  const remaining = SUMMARY_MAX_CHARS - draft.length;

  return (
    <>
      <PemText variant="label" style={styles.sectionLabel}>
        About you
      </PemText>
      <PemText variant="caption" style={styles.sectionHint}>
        Pem updates this from your conversations. You can edit it too.
      </PemText>
      <Pressable
        onPress={handleOpen}
        style={[
          styles.card,
          {
            backgroundColor: colors.cardBackground,
            borderColor: colors.borderMuted,
          },
        ]}
      >
        {summary ? (
          <PemText
            variant="body"
            numberOfLines={3}
            style={{ color: colors.textSecondary, lineHeight: 20 }}
          >
            {summary}
          </PemText>
        ) : (
          <PemText variant="caption" style={{ color: colors.textTertiary }}>
            No summary yet — Pem will learn about you from your conversations.
          </PemText>
        )}
        <PemText
          variant="body"
          style={{ color: pemAmber, marginTop: space[3] }}
        >
          {summary ? "Read more" : "Add"}
        </PemText>
      </Pressable>

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.screen, { backgroundColor: colors.pageBackground, paddingTop: space[8] }]}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: space[4], paddingVertical: space[3] }}>
            <Pressable onPress={() => setOpen(false)} hitSlop={8}>
              <PemText variant="body" style={{ color: colors.textSecondary }}>Cancel</PemText>
            </Pressable>
            <PemText
              variant="caption"
              style={{ color: remaining < 100 ? colors.error : colors.textTertiary }}
            >
              {remaining} remaining
            </PemText>
            <Pressable onPress={handleSave} disabled={saving} hitSlop={8}>
              <PemText variant="body" style={{ color: pemAmber }}>
                {saving ? "Saving..." : "Save"}
              </PemText>
            </Pressable>
          </View>
          <TextInput
            style={{
              flex: 1,
              fontFamily: fontFamily.sans.regular,
              fontSize: fontSize.base,
              color: colors.textPrimary,
              paddingHorizontal: space[4],
              paddingTop: space[3],
              textAlignVertical: "top",
              lineHeight: 22,
            }}
            multiline
            value={draft}
            onChangeText={setDraft}
            placeholder="Tell Pem about yourself — goals, preferences, life situation..."
            placeholderTextColor={colors.textTertiary}
            maxLength={SUMMARY_MAX_CHARS}
            autoFocus
          />
        </View>
      </Modal>
    </>
  );
}

function NotificationTimeCard() {
  const { colors, resolved } = useTheme();
  const { getToken, userId } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const [currentTime, setCurrentTime] = useState("07:00");
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (userId) {
        const snap = await readSettingsScreenCache(userId);
        if (!cancelled && snap) setCurrentTime(snap.notification_time);
      }
      try {
        const r = await getMe(getTokenRef.current);
        if (!cancelled) {
          const t = r.notification_time ?? "07:00";
          setCurrentTime(t);
          if (userId) {
            await mergeSettingsScreenCache(userId, {
              notification_time: t,
              summary: r.summary ?? null,
            });
          }
        }
      } catch {
        /* keep cache / defaults */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const handleTimeChange = useCallback(
    async (_: unknown, date?: Date) => {
      if (Platform.OS === "android") setShowPicker(false);
      if (!date) return;
      const hhmm = dateToHhmm(date);
      setCurrentTime(hhmm);
      try {
        await setNotificationTime(getTokenRef.current, hhmm);
        if (userId) await mergeSettingsScreenCache(userId, { notification_time: hhmm });
      } catch {
        /* ignore */
      }
    },
    [userId],
  );

  return (
    <>
      <PemText variant="label" style={styles.sectionLabel}>
        Daily brief
      </PemText>
      <PemText variant="caption" style={styles.sectionHint}>
        When Pem sends your daily brief notification.
      </PemText>
      <Pressable
        onPress={() => setShowPicker((p) => !p)}
        style={[
          styles.card,
          {
            backgroundColor: colors.cardBackground,
            borderColor: colors.borderMuted,
            flexDirection: "row",
            alignItems: "center",
            gap: space[3],
          },
        ]}
      >
        <Bell size={20} stroke={colors.textSecondary} strokeWidth={1.8} />
        <PemText variant="body" style={{ flex: 1, color: colors.textPrimary }}>
          {formatTime12(currentTime)}
        </PemText>
        <ChevronRight
          size={18}
          stroke={colors.textSecondary}
          strokeWidth={1.5}
          style={{ transform: [{ rotate: showPicker ? "90deg" : "0deg" }] }}
        />
      </Pressable>
      {showPicker && (
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.cardBackground,
              borderColor: colors.borderMuted,
              marginTop: space[2],
              alignItems: "center",
            },
          ]}
        >
          <DateTimePicker
            value={hhmmToDate(currentTime)}
            mode="time"
            display="spinner"
            themeVariant={resolved}
            onChange={handleTimeChange}
            minuteInterval={5}
          />
        </View>
      )}
    </>
  );
}

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
      router.replace("/chat");
    }
  }, []);

  const { getToken } = useAuth();

  const onSignOut = useCallback(async () => {
    await signOut();
    router.replace("/welcome");
  }, [signOut]);

  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const isDeleteConfirmed = deleteConfirmText.toUpperCase() === "DELETE";

  const handleConfirmDelete = useCallback(async () => {
    if (!isDeleteConfirmed || isDeleting) return;
    setIsDeleting(true);
    try {
      await deleteAccount(getToken);
      await signOut();
      router.replace("/welcome");
    } catch {
      setIsDeleting(false);
    }
  }, [isDeleteConfirmed, isDeleting, getToken, signOut]);

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
                    <ActivityIndicator
                      color={resolved === "dark" ? colors.textPrimary : colors.placeholder}
                    />
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

        <SummaryCard />

        <NotificationTimeCard />

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

        <CalendarSection />

        <PemText variant="label" style={styles.sectionLabel}>
          Legal
        </PemText>
        <View style={[styles.card, { backgroundColor: colors.cardBackground, borderColor: colors.borderMuted, padding: 0, overflow: "hidden" }]}>
          <Pressable
            style={styles.legalRow}
            onPress={() => void openExternalUrl("https://heypem.com/terms")}
          >
            <PemText variant="body" style={{ flex: 1, color: colors.textPrimary }}>Terms of Service</PemText>
            <ChevronRight size={16} stroke={colors.textTertiary} />
          </Pressable>
          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.borderMuted }} />
          <Pressable
            style={styles.legalRow}
            onPress={() => void openExternalUrl("https://heypem.com/privacy")}
          >
            <PemText variant="body" style={{ flex: 1, color: colors.textPrimary }}>Privacy Policy</PemText>
            <ChevronRight size={16} stroke={colors.textTertiary} />
          </Pressable>
        </View>

        <View style={styles.signOutWrap}>
          <PemButton variant="secondary" size="md" onPress={onSignOut}>
            Sign out
          </PemButton>
        </View>

        <Pressable onPress={() => { setDeleteModalVisible(true); setDeleteConfirmText(""); }} style={styles.deleteWrap}>
          <PemText variant="caption" style={styles.deleteText}>
            Delete Account
          </PemText>
        </Pressable>
      </ScrollView>

      <Modal visible={deleteModalVisible} transparent animationType="fade">
        <View style={styles.deleteOverlay}>
          <View style={[styles.deleteCard, { backgroundColor: colors.cardBackground }]}>
            <PemText variant="title" style={{ textAlign: "center", marginBottom: space[3] }}>
              Delete Account
            </PemText>
            <PemText variant="bodyMuted" style={{ textAlign: "center", marginBottom: space[5], lineHeight: 22 }}>
              This will permanently delete all your data including tasks, calendar connections, memories, and chat history. This action is irreversible.
            </PemText>
            <TextInput
              style={[styles.deleteInput, { color: colors.textPrimary, borderColor: deleteConfirmText ? (isDeleteConfirmed ? "#d70015" : colors.borderMuted) : colors.borderMuted, backgroundColor: colors.secondarySurface }]}
              value={deleteConfirmText}
              onChangeText={setDeleteConfirmText}
              placeholder="Type DELETE to confirm"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <Pressable
              onPress={handleConfirmDelete}
              disabled={!isDeleteConfirmed || isDeleting}
              style={[styles.deleteBtn, (!isDeleteConfirmed || isDeleting) && { opacity: 0.35 }]}
            >
              {isDeleting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <PemText style={styles.deleteBtnText}>Delete my account</PemText>
              )}
            </Pressable>
            <Pressable onPress={() => setDeleteModalVisible(false)} style={{ marginTop: space[3] }}>
              <PemText variant="body" style={{ textAlign: "center", color: colors.textTertiary }}>Cancel</PemText>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  legalRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: space[4],
    paddingHorizontal: space[5],
  },
  signOutWrap: {
    marginTop: space[10],
    alignItems: "center",
  },
  deleteWrap: {
    marginTop: space[6],
    alignItems: "center",
    paddingBottom: space[4],
  },
  deleteText: {
    color: "#d70015",
    textDecorationLine: "underline",
  },
  deleteOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: space[6],
  },
  deleteCard: {
    width: "100%",
    maxWidth: 340,
    borderRadius: radii.lg,
    padding: space[6],
    alignItems: "center",
  },
  deleteInput: {
    width: "100%",
    paddingHorizontal: space[4],
    paddingVertical: 14,
    borderRadius: radii.md,
    borderWidth: 1.5,
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.base,
    textAlign: "center",
    marginBottom: space[4],
  },
  deleteBtn: {
    width: "100%",
    backgroundColor: "#d70015",
    paddingVertical: 14,
    borderRadius: radii.md,
    alignItems: "center",
  },
  deleteBtnText: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.base,
    color: "#fff",
  },
});
