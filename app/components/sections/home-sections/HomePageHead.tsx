import PemText from "@/components/ui/PemText";
import { useTheme } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, lh, lineHeight, space } from "@/constants/typography";
import { StyleSheet, View } from "react-native";

type Props = {
  sub: string;
  /** Optional small line above sub — assistant / inbox tone. */
  eyebrow?: string;
};

/** Scroll intro under the fixed top bar — title lives in `HomeTopBar`. */
export default function HomePageHead({ sub, eyebrow }: Props) {
  const { colors } = useTheme();
  return (
    <View style={styles.pageHead}>
      {eyebrow ? (
        <PemText style={[styles.eyebrow, { color: colors.pemAmber }]}>{eyebrow}</PemText>
      ) : null}
      <PemText style={[styles.pageSub, { color: colors.textSecondary }]}>{sub}</PemText>
    </View>
  );
}

const styles = StyleSheet.create({
  pageHead: {
    marginTop: space[1],
    marginBottom: space[2],
    gap: space[1],
  },
  eyebrow: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.xs,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  pageSub: {
    fontSize: fontSize.md,
    lineHeight: lh(fontSize.md, lineHeight.relaxed),
    fontFamily: fontFamily.sans.regular,
    maxWidth: 400,
  },
});
