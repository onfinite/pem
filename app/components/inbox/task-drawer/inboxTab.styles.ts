import { fontFamily, fontSize, space } from "@/constants/typography";
import { StyleSheet } from "react-native";

export const inboxStyles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: space[8],
  },
  emptyText: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.base,
    textAlign: "center",
    paddingHorizontal: space[4],
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionTitle: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.base,
  },
  sectionCount: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.sm,
  },
  /** Slight inset + hairline only — keeps hierarchy without a separate “card” surface. */
  sectionItemsInset: {
    marginLeft: space[4],
    paddingLeft: space[3],
  },
  undoSection: {
    paddingHorizontal: space[4],
    paddingVertical: space[2],
  },
  undoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    paddingVertical: space[1],
  },
  undoText: {
    flex: 1,
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.sm,
  },
  undoBtn: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.sm,
  },
  doneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: space[2],
    paddingHorizontal: space[4],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  doneText: {
    flex: 1,
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.sm,
    textDecorationLine: "line-through",
  },
  doneTime: {
    fontFamily: fontFamily.sans.regular,
    fontSize: 11,
  },
});
