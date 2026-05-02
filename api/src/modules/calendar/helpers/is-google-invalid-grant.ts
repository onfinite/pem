/** Google OAuth token endpoint returns `invalid_grant` when refresh token is revoked or expired. */
export function isGoogleInvalidGrantError(err: unknown): boolean {
  if (err == null || typeof err !== 'object') return false;
  const e = err as {
    message?: string;
    response?: { data?: unknown };
  };
  if (typeof e.message === 'string' && /invalid_grant/i.test(e.message)) {
    return true;
  }
  const data = e.response?.data;
  if (!data || typeof data !== 'object') return false;
  const errField = (data as { error?: string }).error;
  return errField === 'invalid_grant';
}
