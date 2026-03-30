import PemText from "@/components/ui/PemText";
import { useTheme } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, lh, lineHeight, space } from "@/constants/typography";
import { StyleSheet, View } from "react-native";

type Props = { sub: string };

/** Scroll intro under the fixed top bar — title lives in `HomeTopBar`. */
export default function HomePageHead({ sub }: Props) {
  const { colors } = useTheme();
  return (
    <View style={styles.pageHead}>
      <PemText style={[styles.pageSub, { color: colors.textSecondary }]}>{sub}</PemText>
    </View>
  );
}

const styles = StyleSheet.create({
  pageHead: {
    marginTop: space[1],
    marginBottom: space[2],
  },
  pageSub: {
    fontSize: fontSize.md,
    lineHeight: lh(fontSize.md, lineHeight.relaxed),
    fontFamily: fontFamily.sans.regular,
    maxWidth: 400,
  },
});
