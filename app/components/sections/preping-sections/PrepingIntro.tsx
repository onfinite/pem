import PemText from "@/components/ui/PemText";
import { useTheme } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, lh, lineHeight, space } from "@/constants/typography";
import { StyleSheet, View } from "react-native";

export default function PrepingIntro() {
  const { colors } = useTheme();
  return (
    <View>
      <PemText style={[styles.title, { color: colors.textPrimary }]}>Got your dump</PemText>
      <PemText style={[styles.lead, { color: colors.textSecondary }]}>
        Pem is spinning up parallel work on each prep below. Nothing is final until you open your cards.
      </PemText>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: fontFamily.display.semibold,
    fontSize: fontSize.xxxl,
    lineHeight: lh(fontSize.xxxl, lineHeight.snug),
    marginTop: space[2],
  },
  lead: {
    fontSize: fontSize.md,
    lineHeight: lh(fontSize.md, lineHeight.relaxed),
    maxWidth: 400,
  },
});
