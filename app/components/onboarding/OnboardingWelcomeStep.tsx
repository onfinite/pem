import PemText from "@/components/ui/PemText";
import { space } from "@/constants/typography";
import { Image, StyleSheet, View } from "react-native";
import { onboardingStyles as s } from "./onboarding.styles";

const pemLogo = require("@/assets/images/pem-icon-1024-transparent.png");

export function OnboardingWelcomeStep() {
  return (
    <View style={s.centered}>
      <Image source={pemLogo} style={local.logo} />
      <PemText variant="display" style={s.heading}>
        {`Let's set things up`}
      </PemText>
      <PemText variant="bodyMuted" style={s.body}>
        A few quick questions so Pem can{"\n"}work the way you do.
      </PemText>
    </View>
  );
}

const local = StyleSheet.create({
  logo: {
    width: 96,
    height: 96,
    marginBottom: space[2],
  },
});
