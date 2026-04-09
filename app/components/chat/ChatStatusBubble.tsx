import { useTheme } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, space, radii } from "@/constants/typography";
import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";

type Props = {
  text: string;
};

export default function ChatStatusBubble({ text }: Props) {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.4,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <View style={styles.row}>
      <Animated.View
        style={[
          styles.bubble,
          { backgroundColor: colors.surfacePage, opacity },
        ]}
      >
        <Text style={[styles.text, { color: colors.textSecondary }]}>
          {text}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    marginBottom: space[2],
    paddingHorizontal: space[3],
  },
  bubble: {
    maxWidth: "70%",
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    borderRadius: radii.lg,
    borderBottomLeftRadius: radii.sm,
  },
  text: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.sm,
  },
});
