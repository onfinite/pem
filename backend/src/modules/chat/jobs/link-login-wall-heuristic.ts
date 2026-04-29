export function looksLikeLoginWallMarkdown(markdown: string): boolean {
  const t = markdown.toLowerCase();
  if (markdown.length > 1200) return false;
  return /\b(sign in to|log in to|sign in|log in|subscribe to (read|continue)|create (a free |an |)account|this article is for subscribers|subscription required|cookies?\s*required)\b/i.test(
    t,
  );
}
