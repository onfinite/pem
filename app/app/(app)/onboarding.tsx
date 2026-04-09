import PemLogoRow from "@/components/brand/PemLogoRow";
import PemText from "@/components/ui/PemText";
import { pemAmber } from "@/constants/theme";
import { fontFamily, fontSize, radii, space } from "@/constants/typography";
import { useTheme } from "@/contexts/ThemeContext";
import {
  completeOnboarding,
  getGoogleAuthUrl,
  setNotificationTime,
  setSchedulingPreferences,
} from "@/lib/pemApi";
import { pemImpactLight, pemNotificationSuccess } from "@/lib/pemHaptics";
import { useAuth } from "@clerk/expo";
import * as WebBrowser from "expo-web-browser";
import { CalendarDays, Bell, MessageCircle, ChevronRight, Briefcase } from "lucide-react-native";
import { useCallback, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";

const { width: SCREEN_W } = Dimensions.get("window");
const STEPS = 5;

const WORK_TYPE_OPTIONS: { value: "office" | "remote" | "hybrid"; label: string }[] = [
  { value: "office", label: "Office" },
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
];

const NOTIF_PRESETS = [
  { label: "6:00 AM", value: "06:00" },
  { label: "7:00 AM", value: "07:00" },
  { label: "8:00 AM", value: "08:00" },
  { label: "9:00 AM", value: "09:00" },
];

export default function OnboardingScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const [step, setStep] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [calConnected, setCalConnected] = useState(false);
  const [selectedTime, setSelectedTime] = useState("07:00");
  const [workType, setWorkType] = useState<"office" | "remote" | "hybrid">("office");
  const [finishing, setFinishing] = useState(false);

  const goNext = useCallback(() => {
    const next = Math.min(step + 1, STEPS - 1);
    setStep(next);
    Animated.spring(scrollX, {
      toValue: -next * SCREEN_W,
      useNativeDriver: true,
    }).start();
    pemImpactLight();
  }, [step, scrollX]);

  const handleConnectGoogle = useCallback(async () => {
    try {
      const { url } = await getGoogleAuthUrl(getTokenRef.current);
      await WebBrowser.openBrowserAsync(url);
      setCalConnected(true);
    } catch {
      // user cancelled or error — they can still proceed
    }
  }, []);

  const handleSetTime = useCallback(
    async (time: string) => {
      setSelectedTime(time);
      try {
        await setNotificationTime(getTokenRef.current, time);
      } catch {
        // non-blocking
      }
    },
    [],
  );

  const handleSavePrefs = useCallback(async () => {
    try {
      await setSchedulingPreferences(getTokenRef.current, {
        work_type: workType,
        personal_windows: workType === "remote" ? ["evenings", "weekends", "lunch"] : ["evenings", "weekends"],
      });
    } catch {
      // non-blocking
    }
  }, [workType]);

  const handleFinish = useCallback(async () => {
    if (finishing) return;
    setFinishing(true);
    try {
      await handleSavePrefs();
      await completeOnboarding(getTokenRef.current);
      pemNotificationSuccess();
      router.replace("/chat");
    } catch {
      setFinishing(false);
    }
  }, [finishing, handleSavePrefs]);

  return (
    <View style={[styles.root, { backgroundColor: colors.pageBackground, paddingTop: insets.top }]}>
      {/* Progress dots */}
      <View style={styles.dots}>
        {Array.from({ length: STEPS }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              {
                backgroundColor: i <= step ? pemAmber : colors.borderMuted,
              },
            ]}
          />
        ))}
      </View>

      {/* Sliding pages */}
      <Animated.View
        style={[styles.pages, { transform: [{ translateX: scrollX }] }]}
      >
        {/* Step 1: Welcome */}
        <View style={[styles.page, { width: SCREEN_W }]}>
          <View style={styles.centered}>
            <PemLogoRow size="large" />
            <PemText variant="display" style={styles.heading}>
              Welcome to Pem
            </PemText>
            <PemText variant="bodyMuted" style={styles.body}>
              Your trusted companion for a clear mind.{"\n"}
              Dump your thoughts — voice or text.{"\n"}
              Pem organizes, plans, and keeps track.
            </PemText>
          </View>
        </View>

        {/* Step 2: Calendar */}
        <View style={[styles.page, { width: SCREEN_W }]}>
          <View style={styles.centered}>
            <View style={[styles.iconCircle, { backgroundColor: pemAmber + "18" }]}>
              <CalendarDays size={36} color={pemAmber} />
            </View>
            <PemText variant="display" style={styles.heading}>
              Connect your calendar
            </PemText>
            <PemText variant="bodyMuted" style={styles.body}>
              Pem reads your schedule so it can plan around{"\n"}
              your meetings and suggest the best times.
            </PemText>
            <Pressable
              onPress={handleConnectGoogle}
              style={[
                styles.primaryBtn,
                calConnected && { backgroundColor: "#27ae60" },
              ]}
            >
              <Text style={styles.primaryBtnText}>
                {calConnected ? "Connected ✓" : "Connect Google Calendar"}
              </Text>
            </Pressable>
            <Pressable onPress={goNext}>
              <Text style={[styles.skipText, { color: colors.textTertiary }]}>
                Skip for now
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Step 3: Notification time */}
        <View style={[styles.page, { width: SCREEN_W }]}>
          <View style={styles.centered}>
            <View style={[styles.iconCircle, { backgroundColor: pemAmber + "18" }]}>
              <Bell size={36} color={pemAmber} />
            </View>
            <PemText variant="display" style={styles.heading}>
              Morning brief
            </PemText>
            <PemText variant="bodyMuted" style={styles.body}>
              Every morning Pem sends you a summary.{"\n"}
              When would you like it?
            </PemText>
            <View style={styles.timeGrid}>
              {NOTIF_PRESETS.map((p) => (
                <Pressable
                  key={p.value}
                  onPress={() => handleSetTime(p.value)}
                  style={[
                    styles.timeChip,
                    {
                      backgroundColor:
                        selectedTime === p.value ? pemAmber : colors.cardBackground,
                      borderColor:
                        selectedTime === p.value ? pemAmber : colors.borderMuted,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.timeChipText,
                      {
                        color: selectedTime === p.value ? "#fff" : colors.textPrimary,
                      },
                    ]}
                  >
                    {p.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        {/* Step 4: Work style */}
        <View style={[styles.page, { width: SCREEN_W }]}>
          <View style={styles.centered}>
            <View style={[styles.iconCircle, { backgroundColor: pemAmber + "18" }]}>
              <Briefcase size={36} color={pemAmber} />
            </View>
            <PemText variant="display" style={styles.heading}>
              How do you work?
            </PemText>
            <PemText variant="bodyMuted" style={styles.body}>
              This helps Pem schedule personal tasks{"\n"}
              around your work and find the right times.
            </PemText>
            <View style={styles.timeGrid}>
              {WORK_TYPE_OPTIONS.map((o) => (
                <Pressable
                  key={o.value}
                  onPress={() => setWorkType(o.value)}
                  style={[
                    styles.timeChip,
                    {
                      backgroundColor: workType === o.value ? pemAmber : colors.cardBackground,
                      borderColor: workType === o.value ? pemAmber : colors.borderMuted,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.timeChipText,
                      { color: workType === o.value ? "#fff" : colors.textPrimary },
                    ]}
                  >
                    {o.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        {/* Step 5: First dump */}
        <View style={[styles.page, { width: SCREEN_W }]}>
          <View style={styles.centered}>
            <View style={[styles.iconCircle, { backgroundColor: pemAmber + "18" }]}>
              <MessageCircle size={36} color={pemAmber} />
            </View>
            <PemText variant="display" style={styles.heading}>
              You're all set
            </PemText>
            <PemText variant="bodyMuted" style={styles.body}>
              Start by dumping whatever is on your mind.{"\n"}
              Voice or text — Pem handles the rest.
            </PemText>
            <Pressable
              onPress={handleFinish}
              disabled={finishing}
              style={[styles.primaryBtn, finishing && { opacity: 0.5 }]}
            >
              <Text style={styles.primaryBtnText}>
                {finishing ? "Starting..." : "Start chatting"}
              </Text>
            </Pressable>
          </View>
        </View>
      </Animated.View>

      {/* Bottom: Next / Skip */}
      {step < STEPS - 1 && (
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + space[4] }]}>
          {step === 0 && (
            <Pressable onPress={goNext} style={styles.primaryBtn}>
              <Text style={styles.primaryBtnText}>Get started</Text>
              <ChevronRight size={18} color="#fff" />
            </Pressable>
          )}
          {step > 0 && step < STEPS - 1 && (
            <Pressable onPress={goNext} style={styles.primaryBtn}>
              <Text style={styles.primaryBtnText}>Continue</Text>
              <ChevronRight size={18} color="#fff" />
            </Pressable>
          )}
        </View>
      )}

      {step === STEPS - 1 && <View style={{ height: insets.bottom + space[4] }} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    paddingVertical: space[4],
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  pages: {
    flexDirection: "row",
    width: SCREEN_W * STEPS,
    flex: 1,
  },
  page: {
    width: SCREEN_W,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: space[6],
  },
  centered: {
    alignItems: "center",
    maxWidth: 340,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: space[4],
  },
  heading: {
    marginTop: space[4],
    textAlign: "center",
    fontSize: 26,
    lineHeight: 32,
  },
  body: {
    marginTop: space[3],
    textAlign: "center",
    lineHeight: 22,
  },
  primaryBtn: {
    marginTop: space[6],
    backgroundColor: pemAmber,
    paddingHorizontal: space[6],
    paddingVertical: 14,
    borderRadius: radii.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  primaryBtnText: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.base,
    color: "#fff",
  },
  skipText: {
    marginTop: space[4],
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.sm,
  },
  timeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 10,
    marginTop: space[6],
  },
  timeChip: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  timeChipText: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.sm,
  },
  bottomBar: {
    alignItems: "center",
    paddingTop: space[3],
  },
});
