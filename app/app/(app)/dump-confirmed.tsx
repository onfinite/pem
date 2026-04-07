import PemButton from "@/components/ui/PemButton";
import PemText from "@/components/ui/PemText";
import { amber, surfacePage } from "@/constants/theme";
import { space } from "@/constants/typography";
import { useTheme } from "@/contexts/ThemeContext";
import { pemNotificationSuccess } from "@/lib/pemHaptics";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Check } from "lucide-react-native";
import { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const CHECK_SIZE = 96;
const CHECK_ICON = 44;

/**
 * Post-dump confirmation: headline, animated brand-colored check, then actions.
 */
export default function DumpConfirmedScreen() {
  const insets = useSafeAreaInsets();
  const { colors, resolved } = useTheme();
  const { dumpId: dumpIdParam } = useLocalSearchParams<{
    dumpId?: string | string[];
  }>();
  const dumpId =
    typeof dumpIdParam === "string"
      ? dumpIdParam
      : Array.isArray(dumpIdParam)
        ? dumpIdParam[0]
        : "";

  const scale = useRef(new Animated.Value(0.35)).current;
  const checkOpacity = useRef(new Animated.Value(0)).current;
  const buttonsOpacity = useRef(new Animated.Value(0)).current;
  const hapticFired = useRef(false);

  const gradientColors = useMemo(
    (): readonly [string, string, string] =>
      resolved === "dark"
        ? [colors.brandMutedSurface, colors.cardBackground, colors.pageBackground]
        : [surfacePage, amber[50], amber[100]],
    [colors, resolved],
  );

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        friction: 7,
        tension: 140,
        useNativeDriver: true,
      }),
      Animated.timing(checkOpacity, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished && !hapticFired.current) {
        hapticFired.current = true;
        pemNotificationSuccess();
      }
    });

    Animated.sequence([
      Animated.delay(320),
      Animated.timing(buttonsOpacity, {
        toValue: 1,
        duration: 380,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [scale, checkOpacity, buttonsOpacity]);

  const goInbox = () => {
    if (dumpId) {
      router.replace({ pathname: "/inbox", params: { dumpId } });
    } else {
      router.replace("/inbox");
    }
  };

  const goDumpMore = () => {
    router.replace("/dump");
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.pageBackground }]}>
      <StatusBar style={resolved === "dark" ? "light" : "dark"} />
      <LinearGradient
        colors={gradientColors}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <View
          style={[
            styles.inner,
            { paddingTop: insets.top + space[4], paddingBottom: Math.max(insets.bottom, space[6]) },
          ]}
        >
          <PemText variant="headline" style={styles.title}>
            Pem&apos;s got it.
          </PemText>
          <PemText variant="bodyMuted" style={styles.subtitle}>
            Pem is pulling out what matters and dropping it in your inbox. Open items there when
            you&apos;re ready — nothing happens without you.
          </PemText>

          <View style={styles.checkRegion}>
            <Animated.View
              style={[
                styles.checkWrap,
                {
                  opacity: checkOpacity,
                  transform: [{ scale }],
                },
              ]}
              accessibilityLabel="Dump received"
            >
              <View
                style={[
                  styles.checkCircle,
                  { backgroundColor: colors.pemAmber },
                ]}
              >
                <Check color={colors.onPrimary} size={CHECK_ICON} strokeWidth={2.5} />
              </View>
            </Animated.View>
          </View>

          <Animated.View style={[styles.actions, { opacity: buttonsOpacity }]}>
            <PemButton variant="primary" size="lg" onPress={goInbox} style={styles.btn}>
              Go to inbox
            </PemButton>
            <PemButton variant="secondary" size="lg" onPress={goDumpMore} style={styles.btn}>
              Dump more
            </PemButton>
          </Animated.View>
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  inner: {
    flex: 1,
    paddingHorizontal: space[6],
  },
  title: {
    textAlign: "center",
    marginBottom: space[2],
  },
  subtitle: {
    textAlign: "center",
    lineHeight: 22,
    marginBottom: space[2],
  },
  checkRegion: {
    flex: 1,
    minHeight: 160,
    justifyContent: "center",
    alignItems: "center",
  },
  checkWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  checkCircle: {
    width: CHECK_SIZE,
    height: CHECK_SIZE,
    borderRadius: CHECK_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  } satisfies ViewStyle,
  actions: {
    gap: space[3],
    width: "100%",
  },
  btn: {
    width: "100%",
  },
});
