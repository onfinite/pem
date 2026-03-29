import { neutral, pemAmber } from "@/constants/theme";
import { fontFamily, fontSize, radii, space } from "@/constants/typography";
import { useEffect, useRef } from "react";
import { Animated, Dimensions, StyleSheet, Text, View } from "react-native";

const { height } = Dimensions.get("window");

interface Props {
  fontsLoaded: boolean;
  onDone: () => void;
}

export default function SplashScreenView({ fontsLoaded, onDone }: Props) {
  const iconAnim = useRef(new Animated.Value(0)).current;
  const line1Anim = useRef(new Animated.Value(0)).current;
  const line2Anim = useRef(new Animated.Value(0)).current;
  const exitAnim = useRef(new Animated.Value(1)).current;

  const iconScale = iconAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.78, 1],
  });
  const line1Y = line1Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [18, 0],
  });
  const line2Y = line2Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [14, 0],
  });

  useEffect(() => {
    // Entrance sequence
    Animated.sequence([
      Animated.delay(80),
      Animated.spring(iconAnim, {
        toValue: 1,
        tension: 60,
        friction: 10,
        useNativeDriver: true,
      }),
    ]).start();

    Animated.sequence([
      Animated.delay(320),
      Animated.timing(line1Anim, {
        toValue: 1,
        duration: 420,
        useNativeDriver: true,
      }),
    ]).start();

    Animated.sequence([
      Animated.delay(480),
      Animated.timing(line2Anim, {
        toValue: 1,
        duration: 380,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  useEffect(() => {
    if (!fontsLoaded) return;
    // Hold briefly then fade out
    const timeout = setTimeout(() => {
      Animated.timing(exitAnim, {
        toValue: 0,
        duration: 320,
        useNativeDriver: true,
      }).start(() => onDone());
    }, 2000);
    return () => clearTimeout(timeout);
  }, [fontsLoaded]);

  return (
    <Animated.View style={[styles.root, { opacity: exitAnim }]}>
      {/* Icon */}
      <Animated.View
        style={[
          styles.iconWrap,
          { opacity: iconAnim, transform: [{ scale: iconScale }] },
        ]}
      >
        <View style={styles.iconCircle}>
          <Text style={styles.iconLetter}>P</Text>
        </View>
      </Animated.View>

      {/* Tagline */}
      <View style={styles.tagline}>
        <Animated.Text
          style={[
            styles.line1,
            { opacity: line1Anim, transform: [{ translateY: line1Y }] },
          ]}
        >
          Whatever&apos;s on your mind
        </Animated.Text>
        <Animated.Text
          style={[
            styles.line2,
            { opacity: line2Anim, transform: [{ translateY: line2Y }] },
          ]}
        >
          Pem&apos;s got it.
        </Animated.Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: height,
    backgroundColor: pemAmber,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: space[12],
  },
  iconWrap: {
    marginBottom: space[10],
  },
  iconCircle: {
    width: 108,
    height: 108,
    borderRadius: radii.full,
    backgroundColor: neutral.white,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.28,
    shadowRadius: 32,
    elevation: 20,
  },
  iconLetter: {
    fontSize: fontSize.display,
    lineHeight: 72,
    color: pemAmber,
    fontFamily: fontFamily.display.bold,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  tagline: {
    alignItems: "center",
    gap: space[2],
  },
  line1: {
    fontSize: fontSize.xl,
    color: "rgba(255,255,255,0.92)",
    fontFamily: fontFamily.display.italic,
    letterSpacing: 0.2,
    textAlign: "center",
  },
  line2: {
    fontSize: fontSize.sm,
    color: "rgba(255,255,255,0.65)",
    fontFamily: fontFamily.sans.semibold,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    textAlign: "center",
  },
});
