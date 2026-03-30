import { space } from "@/constants/typography";
import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

const WAVE_HEIGHTS = [4, 12, 22, 9, 24, 7, 18, 5, 15, 4, 20, 6];
const WAVE_CENTER_SCALE = 1.65;

type Props = { pemAmber: string; waveInactive: string };

export default function DumpVoiceWaveform({ pemAmber, waveInactive }: Props) {
  const phases = useRef(WAVE_HEIGHTS.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const loops = phases.map((phase, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 55),
          Animated.timing(phase, {
            toValue: 1,
            duration: 420,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(phase, {
            toValue: 0,
            duration: 420,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => {
      loops.forEach((l) => l.stop());
    };
  }, [phases]);

  return (
    <View style={styles.waveCenterTrack} accessibilityLabel="Recording level">
      {WAVE_HEIGHTS.map((h, i) => {
        const base = Math.round(h * WAVE_CENTER_SCALE);
        const scaleY = phases[i].interpolate({
          inputRange: [0, 1],
          outputRange: [0.45, 1],
        });
        return (
          <Animated.View
            key={i}
            style={{
              height: base,
              transform: [{ scaleY }],
              width: 4,
              borderRadius: 2,
              backgroundColor: i < 4 ? pemAmber : waveInactive,
            }}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  waveCenterTrack: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    minHeight: 72,
    marginTop: space[2],
    marginBottom: space[2],
  },
});
