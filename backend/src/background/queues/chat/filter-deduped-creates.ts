export function normalizeDedupeTaskKey(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function filterDedupedCreates<T extends { text: string }>(
  creates: T[],
  activeKeys: Set<string>,
  closedKeys: Set<string>,
): T[] {
  return creates.filter((c) => {
    const k = normalizeDedupeTaskKey(c.text);
    if (!k) return false;
    if (activeKeys.has(k)) return false;
    if (closedKeys.has(k)) return false;
    return true;
  });
}

/** Returns a shallow copy with `creates` filtered. */
export function dedupeExtractionLike<
  T extends { creates: Array<{ text: string }> },
>(extraction: T, activeKeys: Set<string>, closedKeys: Set<string>): T {
  return {
    ...extraction,
    creates: filterDedupedCreates(
      extraction.creates,
      activeKeys,
      closedKeys,
    ),
  };
}

/** Full agent merge shape — shallow copy with `creates` filtered. */
export function dedupeAgentLikeOutput<
  T extends { creates: Array<{ text: string }> },
>(output: T, activeKeys: Set<string>, closedKeys: Set<string>): T {
  return {
    ...output,
    creates: filterDedupedCreates(output.creates, activeKeys, closedKeys),
  };
}
