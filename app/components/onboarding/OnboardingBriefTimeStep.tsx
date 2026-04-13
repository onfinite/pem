import PemText from "@/components/ui/PemText";
import { pemAmber } from "@/constants/theme";
import { useTheme } from "@/contexts/ThemeContext";
import { Bell } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { onboardingStyles as s } from "./onboarding.styles";

const NOTIF_PRESETS = [
  { label: "6:00 AM", value: "06:00" },
  { label: "7:00 AM", value: "07:00" },
  { label: "8:00 AM", value: "08:00" },
  { label: "9:00 AM", value: "09:00" },
];

interface OnboardingBriefTimeStepProps {
  selected: string;
  onSelect: (time: string) => void;
}

export function OnboardingBriefTimeStep({ selected, onSelect }: OnboardingBriefTimeStepProps) {
  const { colors } = useTheme();

  return (
    <View style={s.centered}>
      <View style={s.iconCircle}>
        <Bell size={36} color={pemAmber} />
      </View>
      <PemText variant="display" style={s.heading}>
        Daily brief
      </PemText>
      <PemText variant="bodyMuted" style={s.body}>
        Pem sends you a daily summary.{"\n"}
        When would you like it?
      </PemText>
      <View style={s.chipGrid}>
        {NOTIF_PRESETS.map((p) => (
          <Pressable
            key={p.value}
            onPress={() => onSelect(p.value)}
            style={[
              s.chip,
              {
                backgroundColor: selected === p.value ? pemAmber : colors.cardBackground,
                borderColor: selected === p.value ? pemAmber : colors.borderMuted,
              },
            ]}
          >
            <Text style={[s.chipText, { color: selected === p.value ? "#fff" : colors.textPrimary }]}>
              {p.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
