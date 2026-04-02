import type { JWTPayload } from 'jose';

/** Best-effort email/name from a verified Clerk session JWT (claims vary by template). */
export function clerkProfileFromJwtPayload(payload: JWTPayload): {
  email: string | null;
  name: string | null;
} {
  const o = payload as Record<string, unknown>;

  const emailRaw = o.email ?? o.email_address;
  const email =
    typeof emailRaw === 'string' && emailRaw.includes('@')
      ? emailRaw.trim()
      : null;

  let name: string | null = null;
  if (typeof o.name === 'string' && o.name.trim()) {
    name = o.name.trim();
  } else {
    const fn = typeof o.given_name === 'string' ? o.given_name.trim() : '';
    const ln = typeof o.family_name === 'string' ? o.family_name.trim() : '';
    const joined = [fn, ln].filter(Boolean).join(' ');
    name = joined || null;
  }

  return { email, name };
}
