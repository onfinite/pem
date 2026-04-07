import TimezoneRegistrar from "@/components/auth/TimezoneRegistrar";
import PushNotificationRegistrar from "@/components/push/PushNotificationRegistrar";
import PemLoadingIndicator from "@/components/ui/PemLoadingIndicator";
import { AppDrawerProvider } from "@/contexts/AppDrawerContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@clerk/expo";
import { Redirect, Stack } from "expo-router";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

export default function AppLayout() {
  const { colors } = useTheme();
  const { isLoaded, isSignedIn } = useAuth();

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

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <TimezoneRegistrar />
      <AppDrawerProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.pageBackground },
          }}
        />
      </AppDrawerProvider>
      <PushNotificationRegistrar />
    </GestureHandlerRootView>
  );
}
