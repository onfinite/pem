import { pemAmber } from "@/constants/theme";
import { fontFamily, fontSize, lh, lineHeight, space } from "@/constants/typography";
import { useEffect, useRef } from "react";
import { Animated, Dimensions, Image, StyleSheet, View } from "react-native";

const { height } = Dimensions.get("window");
const logo = require("@/assets/images/pem-icon-1024-transparent.png");

export default function SplashScreenView() {
  const iconAnim = useRef(new Animated.Value(0)).current;
  const line1Anim = useRef(new Animated.Value(0)).current;
  const line2Anim = useRef(new Animated.Value(0)).current;

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only entrance; animated refs are stable
  }, []);

  return (
    <View style={styles.root}>
      <Animated.View
        style={[
          styles.iconWrap,
          { opacity: iconAnim, transform: [{ scale: iconScale }] },
        ]}
      >
        <Image source={logo} style={styles.logoImage} resizeMode="contain" />
      </Animated.View>

      <View style={styles.tagline}>
        <Animated.Text
          style={[
            styles.line1,
            { opacity: line1Anim, transform: [{ translateY: line1Y }] },
          ]}
        >
          Whatever{"'"}s on your mind
        </Animated.Text>
        <Animated.Text
          style={[
            styles.line2,
            { opacity: line2Anim, transform: [{ translateY: line2Y }] },
          ]}
        >
          Pem{"'"}s got it.
        </Animated.Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: height,
    backgroundColor: pemAmber,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space[6],
    paddingBottom: space[12],
  },
  iconWrap: {
    marginBottom: space[10],
    overflow: "visible",
  },
  logoImage: {
    width: 160,
    height: 160,
  },
  tagline: {
    alignItems: "center",
    gap: space[2],
    width: "100%",
    maxWidth: 400,
    paddingHorizontal: space[2],
  },
  line1: {
    fontSize: fontSize.xl,
    lineHeight: lh(fontSize.xl, lineHeight.relaxed),
    color: "rgba(255,255,255,0.92)",
    fontFamily: fontFamily.display.italic,
    letterSpacing: 0.2,
    textAlign: "center",
    includeFontPadding: false,
  },
  line2: {
    fontSize: fontSize.sm,
    lineHeight: lh(fontSize.sm, lineHeight.relaxed),
    color: "rgba(255,255,255,0.65)",
    fontFamily: fontFamily.sans.semibold,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    textAlign: "center",
    includeFontPadding: false,
  },
});
