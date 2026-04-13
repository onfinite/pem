import PemText from "@/components/ui/PemText";
import { pemAmber } from "@/constants/theme";
import { MessageCircle } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { onboardingStyles as s } from "./onboarding.styles";

interface OnboardingCompleteStepProps {
  isFinishing: boolean;
  onFinish: () => void;
}

export function OnboardingCompleteStep({ isFinishing, onFinish }: OnboardingCompleteStepProps) {
  return (
    <View style={s.centered}>
      <View style={s.iconCircle}>
        <MessageCircle size={36} color={pemAmber} />
      </View>
      <PemText variant="display" style={s.heading}>
        You're all set
      </PemText>
      <PemText variant="bodyMuted" style={s.body}>
        Start by dumping whatever is on your mind.{"\n"}
        Voice or text — Pem handles the rest.
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
