import { fontFamily, fontSize, radii, space } from "@/constants/typography";
import { StyleSheet } from "react-native";

export const editSheetStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheet: {
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
  },
  handleWrap: {
    alignItems: "center",
    paddingTop: space[2],
    paddingBottom: space[1],
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    opacity: 0.35,
  },
  scroll: {
    paddingHorizontal: space[4],
  },
  titleInput: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.lg,
    paddingVertical: space[2],
  },
  sectionLabel: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.xs,
    marginTop: space[3],
    marginBottom: space[1],
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "nowrap",
    gap: space[2],
  },
  chip: {
    paddingHorizontal: space[3],
    paddingVertical: 6,
    borderRadius: radii.full,
    borderWidth: 1,
  },
  chipText: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.sm,
  },
  noteInput: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.base,
    minHeight: 64,
    paddingVertical: space[2],
    textAlignVertical: "top",
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    paddingVertical: space[2],
    paddingHorizontal: space[3],
    borderRadius: radii.sm,
    marginTop: space[3],
  },
  bannerText: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.sm,
    flex: 1,
  },
});
