import { ClerkStuckRecovery } from "@/components/auth/ClerkStuckRecovery";
import SplashScreenView from "@/components/views/SplashScreenView";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { OfflineBanner } from "@/components/ui/OfflineBanner";
import { CLERK_CLIENT_JWT_STORAGE_KEY } from "@/constants/clerkStorage";
import { ThemeProvider, useTheme } from "@/contexts/ThemeContext";
import { pemFontSources } from "@/constants/fonts";
import { MAX_APP_CONTENT_WIDTH } from "@/constants/layout";
import { pemAmber } from "@/constants/theme";
import { ClerkProvider, getClerkInstance } from "@clerk/expo";
import { alignClerkStorageWithPublishableKey } from "@/services/auth/alignClerkStorageWithPublishableKey";
import { pemClerkTokenCache } from "@/services/auth/pemClerkTokenCache";
import { useFonts } from "expo-font";
import { Slot } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as WebBrowser from "expo-web-browser";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";

WebBrowser.maybeCompleteAuthSession();

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

if (!publishableKey) {
  throw new Error("Add your Clerk Publishable Key to the .env file");
}

SplashScreen.preventAutoHideAsync();

const SPLASH_HOLD_MS = 2000;
const CROSSFADE_MS = 520;

function RootLayoutInner() {
  const { colors, resolved } = useTheme();
  const [loaded, error] = useFonts(pemFontSources);
  const fontsReady = !!(loaded || error);

  const contentOpacity = useRef(new Animated.Value(0)).current;
  const splashOpacity = useRef(new Animated.Value(1)).current;
  const [splashLayerMounted, setSplashLayerMounted] = useState(true);

  useEffect(() => {
    if (fontsReady) {
      SplashScreen.hideAsync();
    }
  }, [fontsReady]);

  useEffect(() => {
    if (!fontsReady) return;

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(splashOpacity, {
          toValue: 0,
          duration: CROSSFADE_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(contentOpacity, {
          toValue: 1,
          duration: CROSSFADE_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) {
          setSplashLayerMounted(false);
        }
      });
    }, SPLASH_HOLD_MS);

    return () => clearTimeout(timer);
  }, [fontsReady, contentOpacity, splashOpacity]);

  const statusStyle = resolved === "dark" ? "light" : "dark";

  return (
    <View style={[styles.root, { backgroundColor: colors.pageBackground }]}>
      {fontsReady ? (
        <Animated.View
          style={[
            styles.layer,
            { opacity: contentOpacity, backgroundColor: colors.pageBackground },
          ]}
        >
          <StatusBar style={statusStyle} />
          <OfflineBanner />
          <View style={styles.contentColumn}>
            <Slot />
          </View>
        </Animated.View>
      ) : null}

      {splashLayerMounted ? (
        <Animated.View
          style={[styles.splashOverlay, { opacity: splashOpacity }]}
          pointerEvents={fontsReady ? "none" : "auto"}
        >
          <StatusBar style="light" />
          <SplashScreenView />
        </Animated.View>
      ) : null}
    </View>
  );
}

export default function RootLayout() {
  const [clerkStorageSynced, setClerkStorageSynced] = useState(false);
  const [clerkMountKey, setClerkMountKey] = useState(0);
  const stuckRecoveryCount = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await alignClerkStorageWithPublishableKey(publishableKey);
      } finally {
        if (!cancelled) setClerkStorageSynced(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleClerkStuck = useCallback(() => {
    stuckRecoveryCount.current += 1;
    if (stuckRecoveryCount.current > 2) return;
    void (async () => {
      if (typeof pemClerkTokenCache?.clearToken === "function") {
        await pemClerkTokenCache.clearToken(CLERK_CLIENT_JWT_STORAGE_KEY);
      }
      try {
        const clerk = getClerkInstance({
          publishableKey,
          tokenCache: pemClerkTokenCache,
        });
        const reload = (
          clerk as { __internal_reloadInitialResources?: () => Promise<void> }
        ).__internal_reloadInitialResources;
        if (typeof reload === "function") {
          await reload();
        }
      } catch {
        // Clerk may not be constructible yet; remount still nudges native bootstrap.
      }
      setClerkMountKey((k) => k + 1);
    })();
  }, []);

  if (!clerkStorageSynced) {
    return (
      <ErrorBoundary>
        <View style={styles.clerkBootstrapRoot} />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <ClerkProvider
        key={clerkMountKey}
        publishableKey={publishableKey}
        tokenCache={pemClerkTokenCache}
      >
        <ClerkStuckRecovery onStuck={handleClerkStuck} />
        <ThemeProvider>
          <SafeAreaProvider initialMetrics={initialWindowMetrics ?? undefined}>
            <GestureHandlerRootView style={styles.gestureRoot}>
              <RootLayoutInner />
            </GestureHandlerRootView>
          </SafeAreaProvider>
        </ThemeProvider>
      </ClerkProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  clerkBootstrapRoot: {
    flex: 1,
    backgroundColor: pemAmber,
  },
  gestureRoot: {
    flex: 1,
  },
  root: {
    flex: 1,
  },
  layer: {
    flex: 1,
  },
  contentColumn: {
    flex: 1,
    width: "100%",
    maxWidth: MAX_APP_CONTENT_WIDTH,
    alignSelf: "center",
    minWidth: 0,
  },
  splashOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    backgroundColor: pemAmber,
  },
});
