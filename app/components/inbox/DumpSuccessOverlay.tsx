import PemText from "@/components/ui/PemText";
import { pemAmber } from "@/constants/theme";
import { fontFamily, fontSize, space } from "@/constants/typography";
import { Check } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

type Props = {
  visible: boolean;
  onDone: () => void;
  pageColor: string;
};

const STEPS = [
  "Received",
  "Organizing",
  "Got it",
];

const STEP_INTERVAL = 400;
const DONE_HOLD_MS = 500;
const FADE_MS = 300;

export default function DumpSuccessOverlay({ visible, onDone, pageColor }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const [stepIdx, setStepIdx] = useState(0);
  const [finished, setFinished] = useState(false);
  const spinAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      opacity.setValue(0);
      setStepIdx(0);
      setFinished(false);
      spinAnim.setValue(0);
      return;
    }

    Animated.timing(opacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();

    Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ).start();

    let step = 0;
    const interval = setInterval(() => {
      step += 1;
      if (step >= STEPS.length - 1) {
        clearInterval(interval);
        setStepIdx(STEPS.length - 1);
        setFinished(true);
        return;
      }
      setStepIdx(step);
    }, STEP_INTERVAL);

    return () => clearInterval(interval);
  }, [visible, opacity, spinAnim]);

  useEffect(() => {
    if (!finished) return;
    const timer = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: FADE_MS,
        useNativeDriver: true,
      }).start(({ finished: f }) => {
        if (f) onDone();
      });
    }, DONE_HOLD_MS);
    return () => clearTimeout(timer);
  }, [finished, opacity, onDone]);

  if (!visible) return null;

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <Animated.View
      style={[styles.root, { backgroundColor: pageColor, opacity }]}
      pointerEvents="auto"
    >
      <View style={styles.center}>
        {finished ? (
          <View style={styles.doneCircle}>
            <Check size={32} color="#fff" strokeWidth={3} />
          </View>
        ) : (
          <Animated.View style={[styles.spinner, { transform: [{ rotate: spin }] }]}>
            <View style={styles.spinnerArc} />
          </Animated.View>
        )}

        <PemText style={styles.stepText}>
          {STEPS[stepIdx]}
        </PemText>

        <View style={styles.dots}>
          {STEPS.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor: i <= stepIdx ? pemAmber : "rgba(128,128,128,0.2)",
                },
              ]}
            />
          ))}
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    alignItems: "center",
    justifyContent: "center",
  },
  center: {
    alignItems: "center",
  },
  spinner: {
    width: 56,
    height: 56,
    marginBottom: space[5],
  },
  spinnerArc: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 3,
    borderColor: "transparent",
    borderTopColor: pemAmber,
    borderRightColor: pemAmber,
  },
  doneCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: pemAmber,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space[5],
  },
  stepText: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.sm,
    fontWeight: "400",
    color: "rgba(128,128,128,0.7)",
    letterSpacing: 0.3,
    marginBottom: space[4],
  },
  dots: {
    flexDirection: "row",
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
