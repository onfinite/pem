import { amber, pemAmber } from "@/constants/theme";
import { fontFamily, fontSize, radii, space } from "@/constants/typography";
import { StyleSheet } from "react-native";

export const onboardingStyles = StyleSheet.create({
  centered: {
    alignItems: "center",
    maxWidth: 360,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: space[5],
    backgroundColor: amber[100],
  },
  heading: {
    marginTop: space[5],
    textAlign: "center",
    fontSize: 28,
    lineHeight: 34,
  },
  body: {
    marginTop: space[4],
    textAlign: "center",
    lineHeight: 22,
  },
  primaryBtn: {
    marginTop: space[6],
    backgroundColor: pemAmber,
    paddingHorizontal: space[6],
    paddingVertical: 14,
    borderRadius: radii.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  primaryBtnText: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.base,
    color: "#fff",
  },
  skipText: {
    marginTop: space[4],
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.sm,
  },
  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 10,
    marginTop: space[6],
  },
  chip: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: radii.lg,
    borderWidth: 1,
  },
  chipText: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.base,
  },
});
