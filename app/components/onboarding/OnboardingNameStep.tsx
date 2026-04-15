import PemText from "@/components/ui/PemText";
import { amber, pemAmber } from "@/constants/theme";
import { fontFamily, fontSize, radii, space } from "@/constants/typography";
import { useTheme } from "@/contexts/ThemeContext";
import { User } from "lucide-react-native";
import { StyleSheet, TextInput, View } from "react-native";
import { onboardingStyles as s } from "./onboarding.styles";

interface OnboardingNameStepProps {
  name: string;
  onChangeName: (name: string) => void;
  onSubmit: () => void;
}

export function OnboardingNameStep({ name, onChangeName, onSubmit }: OnboardingNameStepProps) {
  const { colors } = useTheme();

  return (
    <View style={s.centered}>
      <View style={s.iconCircle}>
        <User size={40} color={pemAmber} />
      </View>
      <PemText variant="display" style={s.heading}>
        What should we call you?
      </PemText>
      <PemText variant="bodyMuted" style={s.body}>
        This is how Pem will address you.
      </PemText>
      <TextInput
        style={[
          local.nameInput,
          {
            color: colors.textPrimary,
            borderColor: name.trim() ? amber[300] : colors.borderMuted,
            backgroundColor: colors.cardBackground,
          },
        ]}
        value={name}
        onChangeText={onChangeName}
        placeholder="Your name"
        placeholderTextColor={colors.textTertiary}
        autoCapitalize="words"
        autoCorrect={false}
        returnKeyType="done"
        onSubmitEditing={onSubmit}
        maxLength={100}
      />
    </View>
  );
}

const local = StyleSheet.create({
  nameInput: {
    marginTop: space[6],
    width: 260,
    paddingHorizontal: space[4],
    paddingVertical: 14,
    borderRadius: radii.md,
    borderWidth: 1.5,
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.lg,
    textAlign: "center",
  },
});
