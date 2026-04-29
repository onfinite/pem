import { fontFamily, fontSize, space } from "@/constants/typography";
import { StyleSheet } from "react-native";

export const dayStyles = StyleSheet.create({
  dateLabel: {
    fontFamily: fontFamily.display.semibold,
    fontSize: fontSize.base,
    marginTop: space[3],
    marginBottom: space[1],
  },
  sectionLabel: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.xs,
    letterSpacing: 0.8,
    marginTop: space[2],
    marginBottom: space[1],
  },
  empty: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.sm,
    marginTop: space[3],
    textAlign: "center",
  },
});
