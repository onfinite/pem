import { useTheme } from "@/contexts/ThemeContext";
import { space, radii } from "@/constants/typography";
import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

const DOT_SIZE = 7;
const DOT_GAP = 5;

function BouncingDot({ delay, color }: { delay: number; color: string }) {
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(translateY, {
          toValue: -5,
          duration: 280,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 280,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.delay(400 - delay),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [delay, translateY]);

  return (
    <Animated.View
      style={[
        styles.dot,
        {
          backgroundColor: color,
          transform: [{ translateY }],
        },
      ]}
    />
  );
}

export default function ChatStatusBubble() {
  const { colors } = useTheme();
  const dotColor = colors.textTertiary;

  return (
    <View style={styles.row}>
      <View
        style={[styles.bubble, { backgroundColor: colors.cardBackground }]}
      >
        <View style={styles.dotsRow}>
          <BouncingDot delay={0} color={dotColor} />
          <BouncingDot delay={140} color={dotColor} />
          <BouncingDot delay={280} color={dotColor} />
        </View>
      </View>
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
    paddingHorizontal: space[3],
    paddingVertical: 10,
    borderRadius: radii.lg,
    borderBottomLeftRadius: radii.sm,
  },
  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: DOT_GAP,
    height: 16,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },
});
