import PemText from "@/components/ui/PemText";
import { pemAmber } from "@/constants/theme";
import { fontFamily, fontSize, space } from "@/constants/typography";
import { useTheme } from "@/contexts/ThemeContext";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Bell } from "lucide-react-native";
import { useMemo } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { onboardingStyles as s } from "./onboarding.styles";

interface OnboardingBriefTimeStepProps {
  selected: string;
  onSelect: (time: string) => void;
}

function parseHHMM(hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setHours(h ?? 7, m ?? 0, 0, 0);
  return d;
}

function formatHHMM(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatDisplay(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function OnboardingBriefTimeStep({ selected, onSelect }: OnboardingBriefTimeStepProps) {
  const { colors } = useTheme();
  const dateValue = useMemo(() => parseHHMM(selected), [selected]);

  return (
    <View style={s.centered}>
      <View style={s.iconCircle}>
        <Bell size={40} color={pemAmber} />
      </View>
      <PemText variant="display" style={s.heading}>
        Daily brief
      </PemText>
      <PemText variant="bodyMuted" style={s.body}>
        Pem sends you a daily summary.{"\n"}
        When would you like it?
      </PemText>
      <PemText style={[local.timeDisplay, { color: colors.textPrimary }]}>
        {formatDisplay(dateValue)}
      </PemText>
      <View style={local.pickerWrap}>
        <DateTimePicker
          value={dateValue}
          mode="time"
          display={Platform.OS === "ios" ? "spinner" : "spinner"}
          minuteInterval={15}
          onChange={(_e, d) => { if (d) onSelect(formatHHMM(d)); }}
          themeVariant="light"
        />
      </View>
    </View>
  );
}

const local = StyleSheet.create({
  timeDisplay: {
    fontFamily: fontFamily.display.semibold,
    fontSize: fontSize.xxl,
    marginTop: space[5],
    textAlign: "center",
  },
  pickerWrap: {
    marginTop: space[4],
    width: 280,
    alignItems: "center",
    overflow: "hidden",
  },
});
