import PemText from "@/components/ui/PemText";
import { OnboardingBriefTimeStep } from "@/components/onboarding/OnboardingBriefTimeStep";
import { OnboardingCalendarStep } from "@/components/onboarding/OnboardingCalendarStep";
import { OnboardingCompleteStep } from "@/components/onboarding/OnboardingCompleteStep";
import { OnboardingNameStep } from "@/components/onboarding/OnboardingNameStep";
import { OnboardingWelcomeStep } from "@/components/onboarding/OnboardingWelcomeStep";
import { OnboardingWorkStyleStep } from "@/components/onboarding/OnboardingWorkStyleStep";
import { pemAmber } from "@/constants/theme";
import { space } from "@/constants/typography";
import { useTheme } from "@/contexts/ThemeContext";
import {
  completeOnboarding,
  getGoogleAuthUrl,
  getMe,
  setNotificationTime,
  setSchedulingPreferences,
  triggerCalendarSync,
  updateUserName,
} from "@/services/api/pemApi";
import { pemImpactLight, pemNotificationSuccess } from "@/lib/pemHaptics";
import { useAuth } from "@clerk/expo";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { ChevronRight } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Dimensions, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";

const { width: SCREEN_W } = Dimensions.get("window");
const STEPS = 6;

export default function OnboardingScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { getToken } = useAuth();
  const tokenRef = useRef(getToken);
  tokenRef.current = getToken;

  const [step, setStep] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [displayName, setDisplayName] = useState("");
  const [calConnected, setCalConnected] = useState(false);
  const [selectedTime, setSelectedTime] = useState("07:00");
  const [workType, setWorkType] = useState<"office" | "remote" | "hybrid">("office");
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    getMe(tokenRef.current)
      .then((me) => { if (me.name) setDisplayName(me.name); })
      .catch(() => {});
  }, []);

  const goNext = useCallback(() => {
    const next = Math.min(step + 1, STEPS - 1);
    setStep(next);
    Animated.spring(scrollX, { toValue: -next * SCREEN_W, useNativeDriver: true }).start();
    pemImpactLight();
  }, [step, scrollX]);

  const handleSaveName = useCallback(async () => {
    if (!displayName.trim()) return;
    try { await updateUserName(tokenRef.current, displayName.trim()); } catch {}
    goNext();
  }, [displayName, goNext]);

  const handleConnectGoogle = useCallback(async () => {
    try {
      const appRedirect = Linking.createURL("calendar/connected");
      const { url } = await getGoogleAuthUrl(tokenRef.current, appRedirect);
      const result = await WebBrowser.openAuthSessionAsync(url, appRedirect);
      if (result.type === "success") {
        setCalConnected(true);
        triggerCalendarSync(tokenRef.current).catch(() => {});
        setTimeout(goNext, 600);
      }
    } catch {}
  }, [goNext]);

  const handleSetTime = useCallback(async (time: string) => {
    setSelectedTime(time);
    try { await setNotificationTime(tokenRef.current, time); } catch {}
  }, []);

  const handleFinish = useCallback(async () => {
    if (finishing) return;
    setFinishing(true);
    try {
      const windows = workType === "remote"
        ? ["evenings", "weekends", "lunch"]
        : ["evenings", "weekends"];
      await setSchedulingPreferences(tokenRef.current, { work_type: workType, personal_windows: windows });
      await completeOnboarding(tokenRef.current);
      pemNotificationSuccess();
      router.replace("/chat");
    } catch { setFinishing(false); }
  }, [finishing, workType]);

  const isNameStep = step === 1;
  const isFinalStep = step === STEPS - 1;
  const canContinue = !isNameStep || !!displayName.trim();

  return (
    <View style={[styles.root, { backgroundColor: colors.pageBackground, paddingTop: insets.top }]}>
      <View style={styles.dots}>
        {Array.from({ length: STEPS }).map((_, i) => (
          <View key={i} style={[styles.dot, { backgroundColor: i <= step ? pemAmber : colors.borderMuted }]} />
        ))}
      </View>

      <Animated.View style={[styles.pages, { transform: [{ translateX: scrollX }] }]}>
        <View style={[styles.page, { width: SCREEN_W }]}>
          <OnboardingWelcomeStep />
        </View>
        <View style={[styles.page, { width: SCREEN_W }]}>
          <OnboardingNameStep name={displayName} onChangeName={setDisplayName} onSubmit={handleSaveName} />
        </View>
        <View style={[styles.page, { width: SCREEN_W }]}>
          <OnboardingCalendarStep isConnected={calConnected} onConnect={handleConnectGoogle} onSkip={goNext} />
        </View>
        <View style={[styles.page, { width: SCREEN_W }]}>
          <OnboardingBriefTimeStep selected={selectedTime} onSelect={handleSetTime} />
        </View>
        <View style={[styles.page, { width: SCREEN_W }]}>
          <OnboardingWorkStyleStep selected={workType} onSelect={setWorkType} />
        </View>
        <View style={[styles.page, { width: SCREEN_W }]}>
          <OnboardingCompleteStep isFinishing={finishing} onFinish={handleFinish} />
        </View>
      </Animated.View>

      {!isFinalStep && (
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + space[4] }]}>
          <Pressable
            onPress={isNameStep ? handleSaveName : goNext}
            disabled={!canContinue}
            style={[styles.ctaBtn, !canContinue && { opacity: 0.4 }]}
          >
            <Text style={styles.ctaBtnText}>{step === 0 ? "Get started" : "Continue"}</Text>
            <ChevronRight size={18} color="#fff" />
          </Pressable>
        </View>
      )}

      {isFinalStep && <View style={{ height: insets.bottom + space[4] }} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  dots: { flexDirection: "row", justifyContent: "center", gap: 8, paddingVertical: space[5] },
  dot: { width: 10, height: 10, borderRadius: 5 },
  pages: { flexDirection: "row", width: SCREEN_W * STEPS, flex: 1 },
  page: { justifyContent: "center", alignItems: "center", paddingHorizontal: space[6] },
  bottomBar: { alignItems: "center", paddingTop: space[3] },
  ctaBtn: {
    backgroundColor: pemAmber,
    paddingHorizontal: space[6],
    paddingVertical: 14,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  ctaBtnText: { fontFamily: "DMSans_600SemiBold", fontSize: 15, color: "#fff" },
});
