import PemText from "@/components/PemText";
import { error as errorColor, neutral, textPrimary } from "@/constants/theme";
import { fontFamily, fontSize, lh, lineHeight, radii, space } from "@/constants/typography";
import { useSSO } from "@clerk/expo";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";

type LoadingId = "google" | "apple" | null;

/**
 * Clerk SSO (Google + Apple). Requires `expo-auth-session` + `expo-web-browser`
 * and Google / Apple enabled in the Clerk dashboard.
 */
export default function SocialSignInButtons() {
  const { startSSOFlow } = useSSO();
  const router = useRouter();
  const [loading, setLoading] = useState<LoadingId>(null);
  const [message, setMessage] = useState<string | null>(null);

  const finish = useCallback(
    async (result: {
      createdSessionId: string | null;
      setActive?: (args: { session: string }) => Promise<void>;
      authSessionResult: { type: string } | null;
    }) => {
      const { createdSessionId, setActive, authSessionResult } = result;

      if (
        authSessionResult?.type === "cancel" ||
        authSessionResult?.type === "dismiss"
      ) {
        return;
      }

      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        router.replace("/home");
        return;
      }

      if (!createdSessionId) {
        setMessage("Sign-in did not complete. Try again.");
      }
    },
    [router],
  );

  const onGoogle = useCallback(async () => {
    setMessage(null);
    setLoading("google");
    try {
      const result = await startSSOFlow({ strategy: "oauth_google" });
      await finish(result);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Google sign-in failed.");
    } finally {
      setLoading(null);
    }
  }, [finish, startSSOFlow]);

  const onApple = useCallback(async () => {
    setMessage(null);
    setLoading("apple");
    try {
      const result = await startSSOFlow({ strategy: "oauth_apple" });
      await finish(result);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Apple sign-in failed.");
    } finally {
      setLoading(null);
    }
  }, [finish, startSSOFlow]);

  const busy = loading !== null;

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Continue with Google"
        onPress={onGoogle}
        disabled={busy}
        style={({ pressed }) => [
          styles.btn,
          styles.google,
          pressed && !busy && styles.pressed,
          busy && loading !== "google" && styles.dimmed,
        ]}
      >
        {loading === "google" ? (
          <ActivityIndicator color={textPrimary} />
        ) : (
          <PemText style={styles.googleLabel}>Continue with Google</PemText>
        )}
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Continue with Apple"
        onPress={onApple}
        disabled={busy}
        style={({ pressed }) => [
          styles.btn,
          styles.apple,
          pressed && !busy && styles.pressed,
          busy && loading !== "apple" && styles.dimmed,
        ]}
      >
        {loading === "apple" ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <PemText style={styles.appleLabel}>Continue with Apple</PemText>
        )}
      </Pressable>

      {message ? (
        <PemText variant="caption" style={styles.err}>
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
  btn: {
    minHeight: 52,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space[5],
  },
  google: {
    backgroundColor: neutral.white,
    borderWidth: 1,
    borderColor: neutral[300],
  },
  googleLabel: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.md,
    lineHeight: lh(fontSize.md, lineHeight.normal),
    color: textPrimary,
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
    color: errorColor,
    textAlign: "center",
    marginTop: space[2],
  },
});
