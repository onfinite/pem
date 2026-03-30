import { PrepHubProvider } from "@/contexts/PrepHubContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@clerk/expo";
import { Redirect, Stack } from "expo-router";
import { ActivityIndicator, View } from "react-native";

export default function AppLayout() {
  const { colors } = useTheme();
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!isSignedIn) {
    return <Redirect href="/welcome" />;
  }

  return (
    <PrepHubProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.pageBackground },
        }}
      />
    </PrepHubProvider>
  );
}
