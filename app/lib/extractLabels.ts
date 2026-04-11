import type { ApiExtract } from "@/lib/pemApi";

/** Tone shown as a chip — confident is default, so we hide it. */
export function toneChipLabel(tone: string | null | undefined): string | null {
  if (!tone) return null;
  if (tone === "confident") return null;
  if (tone === "tentative") return "Tentative";
  if (tone === "idea") return "Idea";
  if (tone === "someday") return "Someday";
  return null;
}

export function urgencyChipLabel(urgency: string | null | undefined): string | null {
  if (!urgency || urgency === "none") return null;
  if (urgency === "someday") return "Someday";
  return null;
}

export function batchKeyLabel(batchKey: string | null | undefined): string | null {
  if (!batchKey) return null;
  const map: Record<string, string> = {
    shopping: "Shopping",
    follow_ups: "Follow-ups",
    errands: "Errands",
  };
  return map[batchKey] ?? null;
}

/** Secondary line for list rows when pem_note is empty. */
export function extractListSubtitle(item: ApiExtract): string | undefined {
  if (item.pem_note?.trim()) return item.pem_note;
  const parts: string[] = [];
  const t = toneChipLabel(item.tone);
  if (t) parts.push(t);
  const u = urgencyChipLabel(item.urgency);
  if (u) parts.push(u);
  const b = batchKeyLabel(item.batch_key);
  if (b) parts.push(b);
  if (parts.length > 0) return parts.join(" · ");
  return undefined;
}
