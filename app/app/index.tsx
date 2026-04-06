import PemLoadingIndicator from "@/components/ui/PemLoadingIndicator";
import { useAuth } from "@clerk/expo";
import { Redirect } from "expo-router";
import { View } from "react-native";

/**
 * Entry: send signed-in users to the app hub, others to public marketing.
 */
export default function Index() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return (
      <View style={{ flex: 1 }}>
        <PemLoadingIndicator placement="pageCenter" />
      </View>
    );
  }

  if (isSignedIn) {
    return <Redirect href="/inbox" />;
  }

  return <Redirect href="/welcome" />;
}
