import PemText from "@/components/ui/PemText";
import { pemAmber } from "@/constants/theme";
import { useTheme } from "@/contexts/ThemeContext";
import { Briefcase } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { onboardingStyles as s } from "./onboarding.styles";

const WORK_TYPES: { value: "office" | "remote" | "hybrid"; label: string }[] = [
  { value: "office", label: "Office" },
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
];

interface OnboardingWorkStyleStepProps {
  selected: "office" | "remote" | "hybrid";
  onSelect: (value: "office" | "remote" | "hybrid") => void;
}

export function OnboardingWorkStyleStep({ selected, onSelect }: OnboardingWorkStyleStepProps) {
  const { colors } = useTheme();

  return (
    <View style={s.centered}>
      <View style={s.iconCircle}>
        <Briefcase size={36} color={pemAmber} />
      </View>
      <PemText variant="display" style={s.heading}>
        How do you work?
      </PemText>
      <PemText variant="bodyMuted" style={s.body}>
        This helps Pem schedule personal tasks{"\n"}
        around your work and find the right times.
      </PemText>
      <View style={s.chipGrid}>
        {WORK_TYPES.map((o) => (
          <Pressable
            key={o.value}
            onPress={() => onSelect(o.value)}
            style={[
              s.chip,
              {
                backgroundColor: selected === o.value ? pemAmber : colors.cardBackground,
                borderColor: selected === o.value ? pemAmber : colors.borderMuted,
              },
            ]}
          >
            <Text style={[s.chipText, { color: selected === o.value ? "#fff" : colors.textPrimary }]}>
              {o.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
