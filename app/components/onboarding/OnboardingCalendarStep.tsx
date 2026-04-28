import PemText from "@/components/ui/PemText";
import { pemAmber } from "@/constants/theme";
import { useTheme } from "@/contexts/ThemeContext";
import { CalendarDays } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { onboardingStyles as s } from "@/components/onboarding/onboarding.styles";

interface OnboardingCalendarStepProps {
  isConnected: boolean;
  onConnect: () => void;
  onSkip: () => void;
}

export function OnboardingCalendarStep({ isConnected, onConnect, onSkip }: OnboardingCalendarStepProps) {
  const { colors } = useTheme();

  return (
    <View style={s.centered}>
      <View style={s.iconCircle}>
        <CalendarDays size={40} color={pemAmber} />
      </View>
      <PemText variant="display" style={s.heading}>
        Connect your calendar
      </PemText>
      <PemText variant="bodyMuted" style={s.body}>
        Pem reads your schedule so it can plan around{"\n"}
        your meetings and suggest the best times.
      </PemText>
      <Pressable
        onPress={onConnect}
        style={[s.primaryBtn, isConnected && { backgroundColor: "#27ae60" }]}
      >
        <Text style={s.primaryBtnText}>
          {isConnected ? "Connected" : "Connect Google Calendar"}
        </Text>
      </Pressable>
      <Pressable onPress={onSkip}>
        <Text style={[s.skipText, { color: colors.textTertiary }]}>Skip for now</Text>
      </Pressable>
    </View>
  );
}
