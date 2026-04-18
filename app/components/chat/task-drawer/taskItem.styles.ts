import { fontFamily, fontSize, space } from "@/constants/typography";
import { StyleSheet } from "react-native";

export const itemStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    alignSelf: "stretch",
    width: "100%",
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    borderBottomWidth: StyleSheet.hairlineWidth,
    backgroundColor: "transparent",
  },
  /** Takes remaining width next to checkbox; RNGH touchables measure poorly without this shell. */
  rowMain: {
    flex: 1,
    minWidth: 0,
  },
  checkboxHit: {
    paddingRight: 12,
    paddingVertical: 4,
    justifyContent: "center",
  },
  checkboxOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  /** Fills `rowMain`; width forces layout when RNGH TouchableOpacity ignores flex. */
  content: {
    flex: 1,
    minWidth: 0,
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
  },
  text: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.base,
    lineHeight: 20,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 3,
    flexWrap: "wrap",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  metaText: { fontFamily: fontFamily.sans.regular, fontSize: fontSize.xs },
  chip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  chipText: { fontFamily: fontFamily.sans.medium, fontSize: 10 },
  recurrenceChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sourceBadge: {
    paddingHorizontal: 5,
    paddingVertical: 3,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
});
