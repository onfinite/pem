import { createHmac, timingSafeEqual } from 'node:crypto';

const STATE_TTL_MS = 15 * 60 * 1000;

/** Build HMAC-signed OAuth state (Google redirects it back on callback). */
export function signGoogleOAuthState(
  secret: string,
  userId: string,
  appRedirect: string,
): string {
  const exp = Date.now() + STATE_TTL_MS;
  const payload = JSON.stringify({
    userId,
    appRedirect: appRedirect ?? '',
    exp,
  });
  const sig = createHmac('sha256', secret).update(payload).digest('hex');
  const envelope = JSON.stringify({ payload, sig });
  return Buffer.from(envelope, 'utf8').toString('base64url');
}

/** Verifies signature and expiry; throws if invalid or expired. */
export function verifyGoogleOAuthState(
  secret: string,
  state: string,
): { userId: string; appRedirect: string } {
  let envelope: unknown;
  try {
    envelope = JSON.parse(
      Buffer.from(state, 'base64url').toString('utf8'),
    ) as unknown;
  } catch {
    throw new Error('Invalid OAuth state');
  }
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    throw new Error('Invalid OAuth state');
  }
  const o = envelope as Record<string, unknown>;
  const payload = typeof o.payload === 'string' ? o.payload : '';
  const sig = typeof o.sig === 'string' ? o.sig : '';
  if (!payload || !/^[0-9a-f]{64}$/i.test(sig)) {
    throw new Error('Invalid OAuth state');
  }
  const expectedHex = createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  const sigBuf = Buffer.from(sig.toLowerCase(), 'utf8');
  const expBuf = Buffer.from(expectedHex, 'utf8');
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    throw new Error('Invalid OAuth state');
  }

  let inner: { userId?: unknown; appRedirect?: unknown; exp?: unknown };
  try {
    inner = JSON.parse(payload) as {
      userId?: unknown;
      appRedirect?: unknown;
      exp?: unknown;
    };
  } catch {
    throw new Error('Invalid OAuth state');
  }
  if (typeof inner.userId !== 'string' || !inner.userId.trim()) {
    throw new Error('Invalid OAuth state');
  }
  if (typeof inner.exp !== 'number' || Number.isNaN(inner.exp)) {
    throw new Error('Invalid OAuth state');
  }
  if (Date.now() > inner.exp) {
    throw new Error('OAuth state expired');
  }
  const ar = typeof inner.appRedirect === 'string' ? inner.appRedirect : '';
  return { userId: inner.userId.trim(), appRedirect: ar };
}
