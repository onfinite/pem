import { messageForSsoSignInFailure } from "@/utils/auth/messageForSsoSignInFailure";

export type ClerkSsoFinishResult = {
  createdSessionId: string | null;
  setActive?: (args: { session: string }) => Promise<void>;
  authSessionResult: { type: string; url?: string } | null;
  signIn?: {
    status?: string | null;
    firstFactorVerification?: { status?: string | null };
  };
};

export async function finishClerkSsoSessionActivation(input: {
  result: ClerkSsoFinishResult;
  redirectUrl: string;
  clerkSetActive: (args: { session: string }) => Promise<void>;
  /** Called after `setActive` when a session id is present (e.g. `router.replace("/chat")`). */
  onSessionActivated: () => void;
  setMessage: (msg: string | null) => void;
}): Promise<void> {
  const { result, redirectUrl, clerkSetActive, onSessionActivated, setMessage } = input;
  const { createdSessionId, setActive, authSessionResult, signIn } = result;
  const t = authSessionResult?.type;
  if (t === "cancel" || t === "dismiss") return;
  const activate = setActive ?? clerkSetActive;
  if (createdSessionId && activate) {
    await activate({ session: createdSessionId });
    onSessionActivated();
    return;
  }
  const hint = messageForSsoSignInFailure({
    createdSessionId,
    authSessionResult,
    signInStatus: signIn?.status ?? null,
    firstFactorVerificationStatus: signIn?.firstFactorVerification?.status ?? null,
    expectedRedirectUrl: redirectUrl,
  });
  if (__DEV__ && hint && t === "success") {
    console.warn("[Pem] Clerk SSO callback url:", authSessionResult?.url ?? "(missing)");
  }
  if (hint) setMessage(hint);
}
