/**
 * Builds markdown for prep bodies so PemMarkdown renders tappable links (not raw URL text).
 */

export function linkLabelFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return "Open link";
  }
}

/** One bullet line: plain text, bare URL, www, or "Title — https://…". */
export function lineToMarkdownBullet(line: string): string {
  const t = line.trim();
  if (!t) return "";

  const urlOnly = /^(https?:\/\/\S+)$/i.exec(t);
  if (urlOnly) {
    const url = urlOnly[1];
    return `- [${linkLabelFromUrl(url)}](${url})`;
  }

  const wwwOnly = /^(www\.\S+)$/i.exec(t);
  if (wwwOnly) {
    const url = `https://${wwwOnly[1]}`;
    return `- [${linkLabelFromUrl(url)}](${url})`;
  }

  const titledHttp =
    /^(.+?)\s*[–—:]\s*(https?:\/\/\S+)$/i.exec(t) || /^(.+?)\s*[–—:]\s*(www\.\S+)$/i.exec(t);
  if (titledHttp) {
    let url = titledHttp[2];
    if (url.startsWith("www.")) url = `https://${url}`;
    return `- [${titledHttp[1].trim()}](${url})`;
  }

  return `- ${t}`;
}

export function formatKeyPointsMarkdown(lines: string[], mode: "search" | "research"): string {
  const bullets = lines.map(lineToMarkdownBullet).filter(Boolean).join("\n");
  if (!bullets) return "";
  if (mode === "search") {
    return `\n\n**Key points**\n\n${bullets}`;
  }
  return `\n\n${bullets}`;
}

export function formatSourcesMarkdown(lines: string[]): string {
  const bullets = lines.map(lineToMarkdownBullet).filter(Boolean).join("\n");
  if (!bullets) return "";
  return `\n\n**Sources**\n\n${bullets}`;
}
