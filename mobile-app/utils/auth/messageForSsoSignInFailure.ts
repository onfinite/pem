import { extractRotatingTokenNonce } from "@/utils/auth/extractRotatingTokenNonce";

type AuthSessionLike = { type: string; url?: string } | null | undefined;

export type SsoFailureContext = {
  createdSessionId: string | null;
  authSessionResult: AuthSessionLike;
  signInStatus?: string | null;
  firstFactorVerificationStatus?: string | null;
  /** Same value passed to Clerk `signIn.create({ redirectUrl })` — must be allowlisted or Clerk omits the nonce. */
  expectedRedirectUrl?: string | null;
};

/**
 * User-facing copy when `startSSOFlow` returns without an activated session.
 */
export function messageForSsoSignInFailure(input: SsoFailureContext): string | null {
  const {
    createdSessionId,
    authSessionResult,
    signInStatus,
    firstFactorVerificationStatus,
    expectedRedirectUrl,
  } = input;

  if (authSessionResult?.type === "cancel" || authSessionResult?.type === "dismiss") {
    return null;
  }

  if (authSessionResult?.type === "locked") {
    return "Another sign-in is already open. Close it and try again.";
  }

  if (authSessionResult?.type === "error") {
    return "Sign-in failed in the browser. Check the network and try again.";
  }

  if (authSessionResult?.type === "success" && !createdSessionId) {
    const callbackUrl = authSessionResult.url?.trim();
    if (!callbackUrl) {
      return (
        "Sign-in completed in the browser, but the app did not receive a callback URL. " +
        "Try again; if it keeps happening, rebuild the dev client and confirm only one auth browser tab is open."
      );
    }

    const nonce = extractRotatingTokenNonce(callbackUrl);
    if (!nonce?.trim()) {
      const allowlist =
        expectedRedirectUrl?.trim() ??
        "the exact redirect URL Metro logs as [Pem] Clerk SSO redirectUrl";
      const nonceMissingFromUrl = !/rotating_token_nonce=/i.test(callbackUrl);
      if (nonceMissingFromUrl) {
        return (
          "Clerk opened the app on your redirect URL but did not append a session token (no rotating_token_nonce). " +
          "If that URL is already on the Native applications allow list, check: (1) EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is from this same Clerk app (same Frontend API host as the dashboard). " +
          "(2) The iOS bundle identifier of the build on your phone matches the Bundle ID on that Native applications screen (rebuild after changing it). " +
          `(3) The redirect sent to Clerk is exactly: ${allowlist} (add any different dev URL, e.g. exp://…, to the allow list too).`
        );
      }
      return (
        "The callback URL contained rotating_token_nonce but Pem could not read it. Update the app and try again, " +
        "or contact support with the dev log line [Pem] Clerk SSO callback url:."
      );
    }

    if (firstFactorVerificationStatus === "transferable") {
      return (
        "This Google/Apple account is new to Pem but a session was not created. " +
        "In Clerk Production, allow OAuth sign-ups (or link this email to an existing account in Clerk), then try again."
      );
    }

    if (signInStatus && signInStatus !== "complete") {
      return `Sign-in did not finish (Clerk: ${signInStatus}). If MFA or another step is required, enable it in Clerk or use a different sign-in method.`;
    }

    return (
      "OAuth succeeded but Pem could not start a session. " +
      "In Clerk Production, confirm Google/Apple are enabled, sign-ups are allowed for new users, and no blocking rules apply to this account."
    );
  }

  if (!createdSessionId) {
    return "Sign-in did not complete. Try again.";
  }

  return null;
}
