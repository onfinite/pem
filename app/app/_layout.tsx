import SplashScreenView from "@/components/views/SplashScreenView";
import { pemFontSources } from "@/constants/fonts";
import { ClerkProvider } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { useFonts } from "expo-font";
import { Slot } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

if (!publishableKey) {
  throw new Error("Add your Clerk Publishable Key to the .env file");
}

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts(pemFontSources);
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      {!splashDone ? (
        <>
          <StatusBar style="light" />
          <SplashScreenView
            fontsLoaded={!!(loaded || error)}
            onDone={() => setSplashDone(true)}
          />
        </>
      ) : (
        <>
          <StatusBar style="dark" />
          <Slot />
        </>
      )}
    </ClerkProvider>
  );
}
