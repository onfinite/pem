import { pemAmber } from "@/constants/theme";
import { fontFamily, fontSize, space } from "@/constants/typography";
import { Pressable, StyleSheet, Text, View } from "react-native";

const SWIPE_ACTION_MIN_WIDTH = 88;

export function TaskItemSwipeClose({ onPress }: { onPress: () => void }) {
  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={onPress}
        style={styles.action}
        accessibilityRole="button"
        accessibilityLabel="Close task"
      >
        <Text style={styles.label}>Close</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  /**
   * Swipeable’s right panel is a full-width row; without `alignSelf: 'flex-start'`
   * the column default `alignItems: 'stretch'` + `flex: 1` on the button made the
   * action as wide as the row, so `rightWidth` ≈ screen and the task text slid off.
   */
  wrap: {
    height: "100%",
    alignSelf: "flex-start",
    paddingLeft: space[2],
  },
  action: {
    height: "100%",
    minWidth: SWIPE_ACTION_MIN_WIDTH,
    backgroundColor: pemAmber,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: space[4],
  },
  label: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.sm,
    color: "#fff",
  },
});
