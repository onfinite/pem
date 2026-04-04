import type { Prep } from "@/components/sections/home-sections/homePrepData";
import type { DraftCardPayload, ShoppingCardPayload } from "@/lib/adaptivePrep";
import type { PrepResultBlock } from "@/lib/prepBlocks";

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

/** Plain text for one composable draft block (subject/tone + body). */
export function buildDraftBlockShareText(block: Extract<PrepResultBlock, { type: "draft" }>): string {
  const head = [block.subject ? `Subject: ${block.subject}` : null, block.tone ? `Tone: ${block.tone}` : null]
    .filter(Boolean)
    .join("\n");
  const body = block.body.trim();
  return head && body ? `${head}\n\n${body}` : head || body;
}

/** Legacy API draft fields (matches full-prep share formatting). */
export function buildLegacyDraftShareText(
  draftText: string,
  draftSubject: string | null | undefined,
): string {
  const body = draftText.trim();
  if (!body) return "";
  const sub = draftSubject?.trim();
  return sub ? `${sub}\n\n${body}` : body;
}

/** Plain text for a single composable block (Send/share for that section). */
export function buildBlockShareText(block: PrepResultBlock): string {
  return buildPrepBlockShareLines([block]).join("\n\n");
}

function buildPrepBlockShareLines(blocks: PrepResultBlock[]): string[] {
  const out: string[] = [];
  for (const b of blocks) {
    switch (b.type) {
      case "search":
        if (b.answer.trim()) out.push(b.answer.trim());
        for (const u of b.sources) {
          if (u.trim()) out.push(u.trim());
        }
        break;
      case "research":
        if (b.summary.trim()) out.push(b.summary.trim());
        for (const k of b.keyPoints) {
          if (k.trim()) out.push(`- ${k.trim()}`);
        }
        for (const u of b.sources) {
          if (u.trim()) out.push(u.trim());
        }
        break;
      case "options":
        for (const o of b.options) {
          out.push(buildPrepOptionShareTextFromRow(o));
        }
        break;
      case "draft":
        out.push(buildDraftBlockShareText(b));
        break;
      case "guidance": {
        const t = b.title?.trim();
        const body = b.body.trim();
        out.push(t ? `${t}\n\n${body}` : body);
        break;
      }
      case "limitation": {
        const t = b.title?.trim();
        const body = b.body.trim();
        out.push(t ? `${t}\n\n${body}` : body);
        break;
      }
      default:
        break;
    }
  }
  return out.filter(Boolean);
}

function buildPrepOptionShareTextFromRow(o: {
  name: string;
  price: string;
  url: string;
  store: string;
  why: string;
}): string {
  const lines: string[] = [o.name];
  if (o.store?.trim()) lines.push(o.store.trim());
  if (o.price?.trim()) lines.push(o.price.trim());
  if (o.why?.trim()) lines.push(o.why.trim());
  if (o.url?.trim()) lines.push(o.url.trim());
  return lines.join("\n");
}

function buildShoppingCardShareText(c: ShoppingCardPayload): string {
  const lines: string[] = [c.recommendation];
  if (c.query.trim()) lines.push(c.query);
  for (const p of c.products) {
    const bits = [p.name, p.store, p.price, ratingLine(p.rating), p.why, p.url].filter(
      (x): x is string => typeof x === "string" && x.trim().length > 0,
    );
    lines.push(bits.join("\n"));
  }
  if (c.buyingGuide.trim()) lines.push(c.buyingGuide.trim());
  return lines.join("\n\n");
}

function ratingLine(r: number): string | null {
  if (r <= 0) return null;
  return `${r.toFixed(1)} ★`;
}

function buildDraftCardShareText(d: DraftCardPayload): string {
  const head = [d.subject.trim() ? `Subject: ${d.subject.trim()}` : null, `Tone: ${d.tone}`].filter(Boolean);
  const body = d.body.trim();
  const tail = d.assumptions.trim() ? `\n\nAssumed: ${d.assumptions.trim()}` : "";
  return [...head, body].filter(Boolean).join("\n") + tail;
}

/** Full prep content for detail share (markdown-ish body kept as-is). */
export function buildPrepShareablePlainText(prep: Prep): string {
  const parts: string[] = [];
  if (prep.tag?.trim()) parts.push(prep.tag.trim());
  if (prep.title?.trim()) parts.push(prep.title.trim());
  if (prep.summary?.trim()) parts.push(prep.summary.trim());
  if (prep.detailIntro?.trim()) parts.push(prep.detailIntro.trim());
  if (prep.shoppingCard) {
    parts.push(buildShoppingCardShareText(prep.shoppingCard));
    return parts.filter(Boolean).join("\n\n");
  }
  if (prep.draftCard) {
    parts.push(buildDraftCardShareText(prep.draftCard));
    return parts.filter(Boolean).join("\n\n");
  }
  if (prep.blocks?.length) {
   parts.push(...buildPrepBlockShareLines(prep.blocks));
  } else {
    if (prep.options?.length) {
      for (const o of prep.options) {
        parts.push(buildPrepOptionShareText(o));
      }
    }
    if (prep.body?.trim()) parts.push(prep.body.trim());
    if (prep.draftText?.trim()) {
      parts.push(buildLegacyDraftShareText(prep.draftText, prep.draftSubject));
    }
  }
  return parts.filter(Boolean).join("\n\n");
}
