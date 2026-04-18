const SURFACE_MAX = 64;
const REQUEST_ID_MAX = 128;

/** Subset of `ExtractMutationAudit` built from HTTP — assignable where audit is optional. */
export type ExtractAuditFromHttpHeaders = {
  surface?: string;
  requestId?: string;
};

/** Maps optional client headers into service audit fields (no extra log rows). */
export function extractMutationAuditFromHeaders(
  surfaceHeader?: string,
  pemRequestIdHeader?: string,
  requestIdFallback?: string,
): ExtractAuditFromHttpHeaders | undefined {
  const surface = surfaceHeader?.trim().slice(0, SURFACE_MAX);
  const requestId = (pemRequestIdHeader ?? requestIdFallback)
    ?.trim()
    .slice(0, REQUEST_ID_MAX);
  if (!surface && !requestId) return undefined;
  return {
    ...(surface ? { surface } : {}),
    ...(requestId ? { requestId } : {}),
  };
}
