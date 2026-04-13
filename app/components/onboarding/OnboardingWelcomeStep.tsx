import PemLogoRow from "@/components/brand/PemLogoRow";
import PemText from "@/components/ui/PemText";
import { View } from "react-native";
import { onboardingStyles as s } from "./onboarding.styles";

export function OnboardingWelcomeStep() {
  return (
    <View style={s.centered}>
      <PemLogoRow size="large" />
      <PemText variant="display" style={s.heading}>
        Welcome to Pem
      </PemText>
      <PemText variant="bodyMuted" style={s.body}>
        Your trusted companion for a clear mind.{"\n"}
        Dump your thoughts — voice or text.{"\n"}
        Pem organizes, plans, and keeps track.
      </PemText>
    </View>
  );
}
