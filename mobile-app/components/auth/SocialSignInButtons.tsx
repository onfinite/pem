import GoogleGLogo from "@/components/auth/GoogleGLogo";
import PemText from "@/components/ui/PemText";
import { useTheme } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, lh, lineHeight, radii, space } from "@/constants/typography";
import { useClerkSocialSso } from "@/hooks/auth/useClerkSocialSso";
import Ionicons from "@expo/vector-icons/Ionicons";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";

/**
 * Clerk SSO (Google + Apple). Requires `expo-auth-session` + `expo-web-browser`
 * and Google / Apple enabled in the Clerk dashboard (same instance as the publishable key).
 */
export default function SocialSignInButtons() {
  const { colors } = useTheme();
  const { onGoogle, onApple, message, loading, busy, clerkOAuthReady, disableAuth } =
    useClerkSocialSso();

  return (
    <View style={styles.wrap}>
      {!clerkOAuthReady ? (
        <PemText variant="caption" style={[styles.preparing, { color: colors.textTertiary }]}>
          Preparing sign-in…
        </PemText>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Continue with Google"
        onPress={onGoogle}
        disabled={disableAuth}
        style={({ pressed }) => [
          styles.btn,
          {
            backgroundColor: colors.secondarySurface,
            borderWidth: 1,
            borderColor: colors.border,
          },
          pressed && !disableAuth && styles.pressed,
          busy && loading !== "google" && styles.dimmed,
        ]}
      >
        {loading === "google" ? (
          <ActivityIndicator color={colors.textPrimary} />
        ) : (
          <View style={styles.btnContent}>
            <GoogleGLogo size={20} />
            <PemText style={[styles.googleLabel, { color: colors.textPrimary }]}>
              Continue with Google
            </PemText>
          </View>
        )}
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Continue with Apple"
        onPress={onApple}
        disabled={disableAuth}
        style={({ pressed }) => [
          styles.btn,
          styles.apple,
          pressed && !disableAuth && styles.pressed,
          busy && loading !== "apple" && styles.dimmed,
        ]}
      >
        {loading === "apple" ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <View style={styles.btnContent}>
            <Ionicons name="logo-apple" size={22} color="#ffffff" />
            <PemText style={styles.appleLabel}>Continue with Apple</PemText>
          </View>
        )}
      </Pressable>

      {message ? (
        <PemText variant="caption" style={[styles.err, { color: colors.error }]}>
          {message}
        </PemText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    maxWidth: 320,
    gap: space[3],
  },
  preparing: {
    textAlign: "center",
    marginBottom: space[1],
  },
  btn: {
    minHeight: 52,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space[5],
  },
  btnContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space[3],
  },
  googleLabel: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.md,
    lineHeight: lh(fontSize.md, lineHeight.normal),
  },
  apple: {
    backgroundColor: "#000000",
  },
  appleLabel: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.md,
    lineHeight: lh(fontSize.md, lineHeight.normal),
    color: "#ffffff",
  },
  pressed: {
    opacity: 0.88,
  },
  dimmed: {
    opacity: 0.45,
  },
  err: {
    textAlign: "center",
    marginTop: space[2],
  },
});
