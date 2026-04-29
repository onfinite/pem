import { fontFamily, fontSize, space } from "@/constants/typography";
import { StyleSheet } from "react-native";

export const taskDrawerViewStyles = StyleSheet.create({
  /** Modal content is outside app-root `GestureHandlerRootView`; swipe rows need this. */
  modalGestureRoot: {
    flex: 1,
  },
  drawer: {
    flex: 1,
  },
  drawerBody: {
    flex: 1,
    minHeight: 0,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: space[3],
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: space[2],
  },
  tabRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: space[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: space[2],
    paddingHorizontal: space[2],
    marginBottom: -StyleSheet.hairlineWidth,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabLabel: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.sm,
  },
  openCount: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.xs,
    marginRight: space[1],
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: space[8],
  },
  calendar: {
    marginHorizontal: space[2],
  },
  legend: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
    paddingVertical: space[2],
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.xs,
  },
});
