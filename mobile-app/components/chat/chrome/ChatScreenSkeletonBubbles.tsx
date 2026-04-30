import { space } from "@/constants/typography";
import { useTheme } from "@/contexts/ThemeContext";
import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";

export function ChatScreenSkeletonBubbles() {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  const bg = colors.cardBackground;
  return (
    <View style={styles.wrap}>
      {[0.6, 0.45, 0.7, 0.5].map((w, i) => (
        <Animated.View
          key={i}
          style={[
            styles.bubble,
            {
              backgroundColor: bg,
              width: `${Math.round(w * 100)}%`,
              alignSelf: i % 2 === 0 ? "flex-start" : "flex-end",
              opacity,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: space[3],
    paddingBottom: space[4],
    gap: space[2],
  },
  bubble: {
    height: 44,
    borderRadius: 16,
  },
});
