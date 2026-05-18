import {
  finishClerkSsoSessionActivation,
  type ClerkSsoFinishResult,
} from "@/services/auth/finishClerkSsoSessionActivation";
import { recoverClerkSsoSessionIfNeeded } from "@/services/auth/recoverClerkSsoSession";
import { useAuth, useClerk, useSSO } from "@clerk/expo";
import * as AuthSession from "expo-auth-session";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";

export function useClerkSocialSso() {
  const { startSSOFlow } = useSSO();
  const { setActive: clerkSetActive } = useClerk();
  const { isLoaded: isAuthLoaded } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState<"google" | "apple" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const redirectUrl = useMemo(
    () =>
      AuthSession.makeRedirectUri({
        scheme: "pem",
        path: "sso-callback",
      }),
    [],
  );

  const finish = useCallback(
    async (result: ClerkSsoFinishResult) => {
      await finishClerkSsoSessionActivation({
        result,
        redirectUrl,
        clerkSetActive,
        onSessionActivated: () => {
          router.replace("/chat");
        },
        setMessage,
      });
    },
    [clerkSetActive, redirectUrl, router],
  );

  const runStrategy = useCallback(
    async (strategy: "oauth_google" | "oauth_apple", label: "google" | "apple") => {
      if (!isAuthLoaded) return;
      setMessage(null);
      setLoading(label);
      try {
        if (__DEV__) console.warn("[Pem] Clerk SSO redirectUrl:", redirectUrl);
        const ssoResult = await startSSOFlow({ strategy, redirectUrl });
        // User agreed to legal terms on the welcome screen ("By continuing, you agree to…").
        // Clerk requires explicit acceptance for new sign-ups when legal consent is enabled.
        if (
          !ssoResult.createdSessionId &&
          ssoResult.signUp?.status === "missing_requirements" &&
          ssoResult.signUp.missingFields?.length === 1 &&
          ssoResult.signUp.missingFields[0] === "legal_accepted"
        ) {
          await ssoResult.signUp.update({ legalAccepted: true });
        }
        await finish(await recoverClerkSsoSessionIfNeeded({
          ...ssoResult,
          createdSessionId: ssoResult.signUp?.createdSessionId ?? ssoResult.createdSessionId,
        }));
      } catch (e) {
        setMessage(e instanceof Error ? e.message : `${label} sign-in failed.`);
      } finally {
        setLoading(null);
      }
    },
    [finish, isAuthLoaded, redirectUrl, startSSOFlow],
  );

  const onGoogle = useCallback(() => void runStrategy("oauth_google", "google"), [runStrategy]);
  const onApple = useCallback(() => void runStrategy("oauth_apple", "apple"), [runStrategy]);
  return {
    onGoogle,
    onApple,
    message,
    loading,
    busy: loading !== null,
    clerkOAuthReady: isAuthLoaded,
    disableAuth: loading !== null || !isAuthLoaded,
  };
}
