import SplashScreenView from "@/components/views/SplashScreenView";
import { ThemeProvider, useTheme } from "@/contexts/ThemeContext";
import { pemFontSources } from "@/constants/fonts";
import { MAX_APP_CONTENT_WIDTH } from "@/constants/layout";
import { pemAmber } from "@/constants/theme";
import { ClerkProvider } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { useFonts } from "expo-font";
import { Slot } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";

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
  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <ThemeProvider>
        {/*
          Expo Router’s outer SafeAreaProvider sets initialMetrics only on web, so on iOS the first
          frame can use 0 top inset — chrome draws under the status bar / Dynamic Island, then jumps.
          This inner provider uses native initialWindowMetrics so insets are correct from frame 1.
        */}
        <SafeAreaProvider initialMetrics={initialWindowMetrics ?? undefined}>
          <RootLayoutInner />
        </SafeAreaProvider>
      </ThemeProvider>
    </ClerkProvider>
  );
}

const styles = StyleSheet.create({
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
