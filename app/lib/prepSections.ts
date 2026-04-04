/**
 * Canonical prep detail sections — fixed sort order (see `.cursor/rules/pem-prep-sections.mdc`).
 * Builds render-ready sections from `PrepResultBlock[]` + card summary.
 */

import type { PrepOptionRow, PrepResultBlock, PrepSourceChip } from "@/lib/prepBlocks";
import { linkLabelFromUrl } from "@/lib/prepBodyMarkdown";

export type { PrepSourceChip };

export const SECTION_ORDER = [
  "summary",
  "research",
  "pros_cons",
  "options",
  "comparison",
  "draft",
  "action_steps",
  "tips",
  "limitations",
  "sources",
  "follow_up",
] as const;

export type PrepSectionType = (typeof SECTION_ORDER)[number];

export type PrepCanonicalSection =
  | { type: "summary"; content: { text: string } }
  | {
      type: "research";
      content: {
        narrative: string;
        keyPoints: string[];
        sources: PrepSourceChip[];
      };
    }
  | { type: "pros_cons"; content: { pros: string[]; cons: string[]; verdict?: string } }
  | { type: "options"; content: { options: PrepOptionRow[] } }
  | {
      type: "comparison";
      content: {
        headers: string[];
        rows: { label: string; values: string[]; recommended?: boolean }[];
      };
    }
  | {
      type: "draft";
      content: {
        subject: string | null;
        body: string;
        tone: string;
        recipientHint?: string;
      };
    }
  | {
      type: "action_steps";
      content: { steps: { number: number; title: string; detail?: string }[] };
    }
  | { type: "tips"; content: { tips: { text: string; isWarning?: boolean }[] } }
  | {
      type: "limitations";
      content: {
        cannotDo: string;
        canDo: string[];
        suggestedTools?: { name: string; url?: string }[];
      };
    }
  | { type: "sources"; content: { sources: PrepSourceLink[] } }
  | { type: "follow_up"; content: { question: string; prefill?: string } }
  | { type: "search"; content: { answer: string; sources: PrepSourceLink[] } };

/** Parse a source line: URL, "Title — url", or plain text (no link). */
export function parseSourceLineToLink(line: string): PrepSourceChip | null {
  const t = line.trim();
  if (!t) return null;
  const titled =
    /^(.+?)\s*[–—:]\s*(https?:\/\/\S+)$/i.exec(t) ||
    /^(.+?)\s*[–—:]\s*(www\.\S+)$/i.exec(t);
  if (titled) {
    let url = titled[2];
    if (url.startsWith("www.")) url = `https://${url}`;
    return {
      title: titled[1].trim(),
      url,
      domain: domainFromUrl(url),
    };
  }
  if (/^https?:\/\/\S+$/i.test(t)) {
    return { title: linkLabelFromUrl(t), url: t, domain: domainFromUrl(t) };
  }
  if (/^www\.\S+$/i.test(t)) {
    const url = `https://${t}`;
    return { title: linkLabelFromUrl(url), url, domain: domainFromUrl(url) };
  }
  return null;
}

function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function stringsToSourceLinks(lines: string[]): PrepSourceChip[] {
  const out: PrepSourceChip[] = [];
  for (const line of lines) {
    const p = parseSourceLineToLink(line);
    if (p) out.push(p);
  }
  return out.slice(0, 8);
}

function sortSections(sections: PrepCanonicalSection[]): PrepCanonicalSection[] {
  const order = new Map(SECTION_ORDER.map((t, i) => [t, i]));
  return [...sections].sort((a, b) => {
    const ia = order.get(a.type) ?? 99;
    const ib = order.get(b.type) ?? 99;
    return ia - ib;
  });
}

/**
 * Build ordered sections for the prep detail UI.
 * Summary is always first when we have card summary, detail intro, or an explicit summary block.
 */
export function buildCanonicalSectionsFromPrep(params: {
  cardSummary: string | null | undefined;
  detailIntro: string | null | undefined;
  blocks: PrepResultBlock[] | undefined;
}): PrepCanonicalSection[] {
  const blocks = params.blocks ?? [];
  const out: PrepCanonicalSection[] = [];

  let summaryFromBlock = "";
  const restBlocks: PrepResultBlock[] = [];
  for (const b of blocks) {
    if (b.type === "summary") {
      summaryFromBlock = b.text.trim();
    } else {
      restBlocks.push(b);
    }
  }

  let summaryText = "";
  if (summaryFromBlock) {
    summaryText = summaryFromBlock;
  } else {
    const parts = [params.cardSummary?.trim(), params.detailIntro?.trim()].filter(Boolean);
    summaryText = parts.join("\n\n");
  }
  if (summaryText) {
    out.push({ type: "summary", content: { text: summaryText } });
  }

  for (const b of restBlocks) {
    switch (b.type) {
      case "research": {
        const sources = stringsToSourceLinks(b.sources);
        out.push({
          type: "research",
          content: {
            narrative: b.summary.trim(),
            keyPoints: b.keyPoints.map((s) => s.trim()).filter(Boolean),
            sources,
          },
        });
        break;
      }
      case "search": {
        const sources = stringsToSourceLinks(b.sources);
        out.push({
          type: "search",
          content: { answer: b.answer.trim(), sources },
        });
        break;
      }
      case "options":
        out.push({ type: "options", content: { options: b.options } });
        break;
      case "draft":
        out.push({
          type: "draft",
          content: {
            subject: b.subject,
            body: b.body,
            tone: b.tone,
            recipientHint: b.recipientHint,
          },
        });
        break;
      case "pros_cons":
        out.push({
          type: "pros_cons",
          content: {
            pros: b.pros.slice(0, 4),
            cons: b.cons.slice(0, 4),
            verdict: b.verdict,
          },
        });
        break;
      case "action_steps":
        out.push({ type: "action_steps", content: { steps: b.steps.slice(0, 7) } });
        break;
      case "tips":
        out.push({ type: "tips", content: { tips: b.tips.slice(0, 4) } });
        break;
      case "comparison":
        out.push({
          type: "comparison",
          content: {
            headers: b.headers.slice(0, 4),
            rows: b.rows.slice(0, 5),
          },
        });
        break;
      case "limitations":
        out.push({
          type: "limitations",
          content: {
            cannotDo: b.cannotDo,
            canDo: b.canDo,
            suggestedTools: b.suggestedTools,
          },
        });
        break;
      case "sources":
        out.push({ type: "sources", content: { sources: b.sources } });
        break;
      case "follow_up": {
        const q = b.question.trim();
        if (q) {
          out.push({
            type: "follow_up",
            content: { question: q, prefill: b.prefill },
          });
        }
        break;
      }
      case "guidance":
        out.push({
          type: "research",
          content: {
            narrative: b.body.trim(),
            keyPoints: [],
            sources: [],
          },
        });
        break;
      case "limitation": {
        const raw = [b.title, b.body].filter(Boolean).join("\n\n").trim();
        if (raw) {
          out.push({
            type: "limitations",
            content: { cannotDo: raw, canDo: [] },
          });
        }
        break;
      }
      default:
        break;
    }
  }

  return sortSections(out);
}
