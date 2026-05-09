/**
 * Clerk returns `rotating_token_nonce` in the query or hash after OAuth.
 * Prefer `URL` when it works; some RN / custom-scheme URLs parse inconsistently, so we regex-fallback.
 */
function nonceFromRegex(url: string): string | null {
  const m = url.match(/(?:^|[?&#])rotating_token_nonce=([^&#]+)/);
  const raw = m?.[1]?.trim();
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function extractRotatingTokenNonce(url: string | undefined | null): string | null {
  if (!url?.trim()) return null;
  const trimmed = url.trim();

  const fromRegex = nonceFromRegex(trimmed);
  if (fromRegex) return fromRegex;

  try {
    const u = new URL(trimmed);
    const fromQuery = u.searchParams.get("rotating_token_nonce");
    if (fromQuery?.trim()) return fromQuery;

    const hash = u.hash.replace(/^#/, "").trim();
    if (!hash) return null;
    const fromHash = new URLSearchParams(hash).get("rotating_token_nonce");
    return fromHash?.trim() ? fromHash : null;
  } catch {
    return nonceFromRegex(trimmed);
  }
}
