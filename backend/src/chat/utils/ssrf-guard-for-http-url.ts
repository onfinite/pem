/**
 * Reject URLs that point at private or local networks (SSRF mitigation).
 * Returns false if the URL may be fetched.
 */
export function isBlockedSsrFHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h === '0.0.0.0') return true;

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const m = h.match(ipv4);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
  }

  if (h.includes(':') && !h.includes('.')) {
    // IPv6 literal — block link-local and loopback heuristically
    const compact = h.replace(/^\[|\]$/g, '');
    if (compact === '::1') return true;
    if (compact.toLowerCase().startsWith('fe80:')) return true;
  }

  return false;
}
