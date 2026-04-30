import PemText from "@/components/ui/PemText";
import { space } from "@/constants/typography";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { onboardingStyles as s } from "@/components/onboarding/onboarding.styles";

const pemLogo = require("@/assets/images/pem-icon-1024-transparent.png");

interface OnboardingCompleteStepProps {
  isFinishing: boolean;
  onFinish: () => void;
}

export function OnboardingCompleteStep({ isFinishing, onFinish }: OnboardingCompleteStepProps) {
  return (
    <View style={s.centered}>
      <Image source={pemLogo} style={local.logo} />
      <PemText variant="display" style={s.heading}>
        {`You're all set`}
      </PemText>
      <PemText variant="bodyMuted" style={s.body}>
        Start by dumping whatever is on your mind.{"\n"}
        Pem takes it from there.
      </PemText>
      <Pressable
        onPress={onFinish}
        disabled={isFinishing}
        style={[s.primaryBtn, isFinishing && { opacity: 0.5 }]}
      >
        <Text style={s.primaryBtnText}>
          {isFinishing ? "Starting..." : "Start chatting"}
        </Text>
      </Pressable>
    </View>
  );
}

const local = StyleSheet.create({
  logo: {
    width: 72,
    height: 72,
    marginBottom: space[2],
  },
});
