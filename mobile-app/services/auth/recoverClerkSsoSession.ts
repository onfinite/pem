import { extractRotatingTokenNonce } from "@/utils/auth/extractRotatingTokenNonce";

type LooseSignIn = {
  reload: (args: { rotatingTokenNonce: string }) => Promise<unknown>;
  createdSessionId?: string | null;
  firstFactorVerification?: { status?: string | null };
};

type LooseSignUp = {
  create: (args: { transfer: true }) => Promise<unknown>;
  createdSessionId?: string | null;
};

/** Return shape from `@clerk/expo` `startSSOFlow` (we only touch a few fields). */
export type ClerkSsoFlowResult = {
  createdSessionId: string | null;
  authSessionResult: { type: string; url?: string } | null;
  signIn?: LooseSignIn;
  signUp?: LooseSignUp;
};

/**
 * `useSSO` only reads `rotating_token_nonce` from the query string. If Clerk puts it
 * in the hash, the built-in `reload` runs with an empty nonce — retry with parsed nonce.
 */
export async function recoverClerkSsoSessionIfNeeded(
  result: ClerkSsoFlowResult,
): Promise<ClerkSsoFlowResult> {
  if (result.createdSessionId) return result;
  if (result.authSessionResult?.type !== "success") return result;
  const url = result.authSessionResult.url;
  if (!url?.trim()) return result;

  const nonce = extractRotatingTokenNonce(url);
  if (!nonce || !result.signIn) return result;

  try {
    await result.signIn.reload({ rotatingTokenNonce: nonce });
  } catch {
    return result;
  }

  if (
    result.signIn.firstFactorVerification?.status === "transferable" &&
    result.signUp
  ) {
    try {
      await result.signUp.create({ transfer: true });
    } catch {
      return { ...result, createdSessionId: result.signIn.createdSessionId ?? null };
    }
  }

  const sid = result.signUp?.createdSessionId ?? result.signIn.createdSessionId ?? null;
  return { ...result, createdSessionId: sid };
}
