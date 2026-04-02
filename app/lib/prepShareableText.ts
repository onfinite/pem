import type { Prep } from "@/components/sections/home-sections/homePrepData";

export type PrepOption = NonNullable<Prep["options"]>[number];

/** Plain text for one option (detail pick share). */
export function buildPrepOptionShareText(o: PrepOption): string {
  const lines: string[] = [o.label];
  if (o.store?.trim()) lines.push(o.store.trim());
  if (o.price?.trim()) lines.push(o.price.trim());
  if (o.why?.trim()) lines.push(o.why.trim());
  if (o.url?.trim()) lines.push(o.url.trim());
  return lines.join("\n");
}

/** Full prep content for detail share/copy (markdown-ish body kept as-is). */
export function buildPrepShareablePlainText(prep: Prep): string {
  const parts: string[] = [];
  if (prep.tag?.trim()) parts.push(prep.tag.trim());
  if (prep.title?.trim()) parts.push(prep.title.trim());
  if (prep.summary?.trim()) parts.push(prep.summary.trim());
  if (prep.detailIntro?.trim()) parts.push(prep.detailIntro.trim());
  if (prep.options?.length) {
    for (const o of prep.options) {
      parts.push(buildPrepOptionShareText(o));
    }
  }
  if (prep.body?.trim()) parts.push(prep.body.trim());
  if (prep.draftText?.trim()) {
    const sub = prep.draftSubject?.trim();
    parts.push(sub ? `${sub}\n\n${prep.draftText.trim()}` : prep.draftText.trim());
  }
  return parts.filter(Boolean).join("\n\n");
}
