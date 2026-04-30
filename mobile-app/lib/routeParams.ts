/** Normalize expo-router search params that may be string or string[]. */
export function firstParam(
  v: string | string[] | undefined,
): string | undefined {
  if (typeof v === "string" && v.length > 0) return v;
  if (Array.isArray(v) && typeof v[0] === "string" && v[0].length > 0) {
    return v[0];
  }
  return undefined;
}
