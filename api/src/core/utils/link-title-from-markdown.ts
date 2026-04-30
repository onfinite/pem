/** First markdown H1 or Title: line as weak title hint (fallback when JSON has no title). */
export function linkTitleHintFromMarkdown(md: string): string | null {
  const lines = md.split('\n').slice(0, 40);
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith('# ')) return t.slice(2).trim().slice(0, 500) || null;
    if (/^title\s*:/i.test(t)) {
      return (
        t
          .replace(/^title\s*:/i, '')
          .trim()
          .slice(0, 500) || null
      );
    }
  }
  return null;
}
