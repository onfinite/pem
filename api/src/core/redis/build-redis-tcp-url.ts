/**
 * BullMQ and ioredis need a TCP `rediss://` URL. Upstash exposes REST (`https://…`)
 * separately; for the same database the REST hostname typically accepts Redis on :6379.
 * If derived connections fail in your region, set REDIS_URL explicitly from the Upstash
 * dashboard “Redis” / connect string instead.
 */
export function buildRedisTcpUrlFromUpstashRest(
  restUrlRaw: string | undefined,
  restTokenRaw: string | undefined,
): string | undefined {
  const restUrl = restUrlRaw?.trim();
  const restToken = restTokenRaw?.trim();
  if (!restUrl || !restToken) return undefined;

  try {
    const u = new URL(restUrl);
    if (u.protocol !== 'https:' || !u.hostname) return undefined;
    const password = encodeURIComponent(restToken);
    return `rediss://default:${password}@${u.hostname}:6379`;
  } catch {
    return undefined;
  }
}
