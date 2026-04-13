import PemLogoRow from "@/components/brand/PemLogoRow";
import SocialSignInButtons from "@/components/auth/SocialSignInButtons";
import ScreenScroll from "@/components/layout/ScreenScroll";
import PemText from "@/components/ui/PemText";
import { useTheme } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, space } from "@/constants/typography";
import { useAuth } from "@clerk/expo";
import { Redirect } from "expo-router";
import { Shield } from "lucide-react-native";
import { useEffect, useRef } from "react";
import { Animated, Linking, Pressable, StyleSheet, View } from "react-native";

const TERMS_URL = "https://heypem.com/terms";
const PRIVACY_URL = "https://heypem.com/privacy";

const STAGGER_MS = 180;
const FADE_DURATION = 500;

export default function WelcomeScreen() {
  const { colors } = useTheme();
  const { isLoaded, isSignedIn } = useAuth();

  const anims = useRef([...Array(5)].map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const animations = anims.map((a, i) =>
      Animated.timing(a, {
        toValue: 1,
        duration: FADE_DURATION,
        delay: i * STAGGER_MS,
        useNativeDriver: true,
      }),
    );
    Animated.parallel(animations).start();
  }, [anims]);

  if (!isLoaded) return null;
  if (isSignedIn) return <Redirect href="/chat" />;

  return (
    <ScreenScroll
      backgroundColor={colors.surfacePage}
      bottomInset={space[10]}
      contentStyle={styles.scrollInner}
    >
      <View style={styles.column}>
        <Animated.View style={{ opacity: anims[0] }}>
          <PemLogoRow size="large" />
        </Animated.View>

        <Animated.View style={{ opacity: anims[1] }}>
          <PemText variant="display" style={styles.heroLine1}>
            Dump your thoughts.
          </PemText>
          <PemText variant="brandItalic" style={styles.heroLine2}>
            Pem organizes them.
          </PemText>
        </Animated.View>

        <Animated.View style={{ opacity: anims[2] }}>
          <PemText variant="bodyMuted" style={styles.heroBody}>
            Say or type whatever is on your mind. Pem pulls out what matters, sorts
            it into your inbox, and you come back when you are ready. Not another
            todo list — relief, with you always taking the final step.
          </PemText>
        </Animated.View>

        <Animated.View style={[styles.trustRow, { opacity: anims[3] }]}>
          <Shield size={14} color={colors.textTertiary} />
          <PemText variant="caption" style={{ color: colors.textTertiary }}>
            Your thoughts stay private. Always.
          </PemText>
        </Animated.View>

        <Animated.View style={[styles.authBlock, { opacity: anims[4] }]}>
          <SocialSignInButtons />
          <PemText variant="caption" style={[styles.legal, { color: colors.textTertiary }]}>
            By continuing, you agree to our{" "}
            <PemText
              variant="caption"
              style={styles.legalLink}
              onPress={() => Linking.openURL(TERMS_URL)}
            >
              Terms of Service
            </PemText>
            {" "}and{" "}
            <PemText
              variant="caption"
              style={styles.legalLink}
              onPress={() => Linking.openURL(PRIVACY_URL)}
            >
              Privacy Policy
            </PemText>
            .
          </PemText>
        </Animated.View>
      </View>
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  scrollInner: {
    flexGrow: 1,
    justifyContent: "center",
    paddingTop: space[6],
    paddingBottom: space[6],
  },
  column: {
    width: "100%",
    maxWidth: 400,
    alignSelf: "center",
    alignItems: "center",
  },
  heroLine1: {
    marginTop: space[8],
    textAlign: "center",
    fontSize: 28,
    lineHeight: 34,
  },
  heroLine2: {
    marginTop: space[2],
    textAlign: "center",
    fontSize: 28,
    lineHeight: 34,
  },
  heroBody: {
    marginTop: space[6],
    textAlign: "center",
    paddingHorizontal: space[2],
  },
  trustRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: space[5],
  },
  authBlock: {
    marginTop: space[8],
    width: "100%",
    alignItems: "center",
  },
  legal: {
    textAlign: "center",
    marginTop: space[4],
    paddingHorizontal: space[4],
    lineHeight: 18,
  },
  legalLink: {
    textDecorationLine: "underline",
  },
});
