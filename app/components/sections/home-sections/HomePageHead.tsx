import PemText from "@/components/ui/PemText";
import { useTheme } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, lh, lineHeight, space } from "@/constants/typography";
import { StyleSheet, View } from "react-native";

type Props = { title: string; sub: string };

export default function HomePageHead({ title, sub }: Props) {
  const { colors } = useTheme();
  return (
    <View style={styles.pageHead}>
      <PemText style={[styles.pageTitle, { color: colors.textPrimary }]}>{title}</PemText>
      <PemText style={[styles.pageSub, { color: colors.textSecondary }]}>{sub}</PemText>
    </View>
  );
}

const styles = StyleSheet.create({
  pageHead: {
    gap: space[2],
    marginTop: space[2],
    marginBottom: space[2],
  },
  pageTitle: {
    fontFamily: fontFamily.display.semibold,
    fontSize: fontSize.xxxl,
    lineHeight: lh(fontSize.xxxl, lineHeight.snug),
    letterSpacing: -0.4,
  },
  pageSub: {
    fontSize: fontSize.md,
    lineHeight: lh(fontSize.md, lineHeight.relaxed),
    fontFamily: fontFamily.sans.regular,
    maxWidth: 400,
  },
});
