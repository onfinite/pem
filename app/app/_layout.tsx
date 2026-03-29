import SplashScreenView from "@/components/views/SplashScreenView";
import { pemFontSources } from "@/constants/fonts";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts(pemFontSources);
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  if (!splashDone) {
    return (
      <>
        <StatusBar style="light" />
        <SplashScreenView
          fontsLoaded={!!(loaded || error)}
          onDone={() => setSplashDone(true)}
        />
      </>
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
