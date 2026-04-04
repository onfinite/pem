import LocationPrepCoordinator from "@/components/location/LocationPrepCoordinator";
import HubToastBanner from "@/components/sections/home-sections/HubToastBanner";
import PemLoadingIndicator from "@/components/ui/PemLoadingIndicator";
import { PrepHubProvider } from "@/contexts/PrepHubContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@clerk/expo";
import { Redirect, Stack } from "expo-router";
import { StyleSheet, View } from "react-native";
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
      <PrepHubProvider>
        <View style={styles.appStack}>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.pageBackground },
            }}
          />
          <HubToastBanner />
          <LocationPrepCoordinator />
        </View>
      </PrepHubProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  appStack: {
    flex: 1,
  },
});
