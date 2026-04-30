import TimezoneRegistrar from "@/components/auth/TimezoneRegistrar";
import PushNotificationRegistrar from "@/components/push/PushNotificationRegistrar";
import PemLoadingIndicator from "@/components/ui/PemLoadingIndicator";
import { useTheme } from "@/contexts/ThemeContext";
import { getMe } from "@/services/api/pemApi";
import { useAuth } from "@clerk/expo";
import { Redirect, Stack, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";

type CheckState = "loading" | "onboarding" | "ready";

export default function AppLayout() {
  const { colors } = useTheme();
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const router = useRouter();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const [check, setCheck] = useState<CheckState>("loading");
  const didRedirect = useRef(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;
    (async () => {
      try {
        const me = await getMe(getTokenRef.current);
        if (!cancelled) {
          setCheck(me.onboarding_completed ? "ready" : "onboarding");
        }
      } catch {
        if (!cancelled) setCheck("ready");
      }
    })();
    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn]);

  // One-time redirect to onboarding if needed
  useEffect(() => {
    if (check === "onboarding" && !didRedirect.current) {
      didRedirect.current = true;
      router.replace("/onboarding");
    }
  }, [check, router]);

  if (!isLoaded) {
    return (
      <View style={{ flex: 1 }}>
        <PemLoadingIndicator placement="pageCenter" />
      </View>
    );
  }

  if (!isSignedIn) {
    return <Redirect href="/welcome" />;
  }

  if (check === "loading") {
    return (
      <View style={{ flex: 1 }}>
        <PemLoadingIndicator placement="pageCenter" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <TimezoneRegistrar />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.pageBackground },
        }}
      />
      <PushNotificationRegistrar />
    </View>
  );
}
