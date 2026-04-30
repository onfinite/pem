/** Hide useless / legacy placeholder copy on link cards. */
export function isGenericOrEmptyLinkPreviewSummary(
  s: string | null | undefined,
): boolean {
  const t = s?.trim() ?? "";
  if (!t) return true;
  const lower = t.toLowerCase();
  if (lower.includes("page content was fetched")) return true;
  if (lower.includes("details are in the excerpt")) return true;
  if (lower.includes("the page returned limited text")) return true;
  if (lower.includes("readable text was fetched but classification")) return true;
  return false;
}
