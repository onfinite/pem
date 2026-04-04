/**
 * Composable prep blocks — mirrors `backend/src/agents/schemas/prep-result.schema.ts`.
 * `parsePrepBlocksFromResult` normalizes API JSON into typed blocks for the UI.
 */

export type PrepOptionRow = {
  name: string;
  price: string;
  url: string;
  store: string;
  why: string;
  imageUrl: string;
  /** Optional — e.g. "4.5 ★" */
  rating?: string;
};

/** Rich source row for chips (section spec). */
export type PrepSourceChip = {
  title: string;
  url: string;
  domain: string;
};

export type PrepResultBlock =
  | { type: "summary"; text: string }
  | { type: "search"; answer: string; sources: string[] }
  | { type: "research"; summary: string; keyPoints: string[]; sources: string[] }
  | { type: "options"; options: PrepOptionRow[] }
  | {
      type: "draft";
      subject: string | null;
      body: string;
      tone: string;
      recipientHint?: string;
    }
  | { type: "guidance"; title?: string; body: string }
  | { type: "limitation"; title?: string; body: string }
  | { type: "pros_cons"; pros: string[]; cons: string[]; verdict?: string }
  | {
      type: "action_steps";
      steps: { number: number; title: string; detail?: string }[];
    }
  | { type: "tips"; tips: { text: string; isWarning?: boolean }[] }
  | {
      type: "comparison";
      headers: string[];
      rows: { label: string; values: string[]; recommended?: boolean }[];
    }
  | {
      type: "limitations";
      cannotDo: string;
      canDo: string[];
      suggestedTools?: { name: string; url?: string }[];
    }
  | { type: "sources"; sources: PrepSourceChip[] }
  | { type: "follow_up"; question: string; prefill?: string };

function isRecord(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

function asStringArray(x: unknown): string[] {
  if (!Array.isArray(x)) return [];
  return x.filter((i): i is string => typeof i === "string");
}

function parseOptionRow(o: unknown): PrepOptionRow | null {
  if (!isRecord(o)) return null;
  return {
    name: typeof o.name === "string" ? o.name : "",
    price: typeof o.price === "string" ? o.price : "",
    url: typeof o.url === "string" ? o.url : "",
    store: typeof o.store === "string" ? o.store : "",
    why: typeof o.why === "string" ? o.why : "",
    imageUrl: typeof o.imageUrl === "string" ? o.imageUrl : "",
    rating: typeof o.rating === "string" ? o.rating : undefined,
  };
}

function parseSourceChip(o: unknown): PrepSourceChip | null {
  if (!isRecord(o)) return null;
  const title = typeof o.title === "string" ? o.title : "";
  const url = typeof o.url === "string" ? o.url : "";
  const domain = typeof o.domain === "string" ? o.domain : "";
  if (!url) return null;
  return {
    title: title || domain || "Source",
    url,
    domain: domain || url.replace(/^https?:\/\//i, "").split("/")[0] || "",
  };
}

function parseComparisonRow(o: unknown): {
  label: string;
  values: string[];
  recommended?: boolean;
} | null {
  if (!isRecord(o)) return null;
  const label = typeof o.label === "string" ? o.label : "";
  const values = asStringArray(o.values);
  const recommended = typeof o.recommended === "boolean" ? o.recommended : undefined;
  if (!label && values.length === 0) return null;
  return { label, values, recommended };
}

function parseStepRow(o: unknown): { number: number; title: string; detail?: string } | null {
  if (!isRecord(o)) return null;
  const num = typeof o.number === "number" ? o.number : Number(o.number);
  const title = typeof o.title === "string" ? o.title : "";
  const detail = typeof o.detail === "string" ? o.detail : undefined;
  if (!title.trim() || Number.isNaN(num)) return null;
  return { number: num, title: title.trim(), detail };
}

function parseTipRow(o: unknown): { text: string; isWarning?: boolean } | null {
  if (!isRecord(o)) return null;
  const text = typeof o.text === "string" ? o.text : "";
  if (!text.trim()) return null;
  return {
    text: text.trim(),
    isWarning: typeof o.isWarning === "boolean" ? o.isWarning : undefined,
  };
}

/** Best-effort parse of `result.blocks` from API. */
export function parsePrepBlocksFromResult(
  result: Record<string, unknown> | null | undefined,
): PrepResultBlock[] | undefined {
  if (!result || !Array.isArray(result.blocks)) return undefined;
  const out: PrepResultBlock[] = [];
  for (const raw of result.blocks) {
    if (!isRecord(raw) || typeof raw.type !== "string") continue;
    switch (raw.type) {
      case "summary":
        out.push({
          type: "summary",
          text: typeof raw.text === "string" ? raw.text : "",
        });
        break;
      case "search":
        out.push({
          type: "search",
          answer: typeof raw.answer === "string" ? raw.answer : "",
          sources: asStringArray(raw.sources),
        });
        break;
      case "research":
        out.push({
          type: "research",
          summary: typeof raw.summary === "string" ? raw.summary : "",
          keyPoints: asStringArray(raw.keyPoints),
          sources: asStringArray(raw.sources),
        });
        break;
      case "options": {
        const opts = Array.isArray(raw.options) ? raw.options : [];
        const rows = opts.map(parseOptionRow).filter((x): x is PrepOptionRow => x !== null);
        if (rows.length) out.push({ type: "options", options: rows.slice(0, 3) });
        break;
      }
      case "draft":
        out.push({
          type: "draft",
          subject: raw.subject === null || typeof raw.subject === "string" ? raw.subject : null,
          body: typeof raw.body === "string" ? raw.body : "",
          tone: typeof raw.tone === "string" ? raw.tone : "",
          recipientHint:
            typeof raw.recipientHint === "string" ? raw.recipientHint : undefined,
        });
        break;
      case "guidance":
        out.push({
          type: "guidance",
          title: typeof raw.title === "string" ? raw.title : undefined,
          body: typeof raw.body === "string" ? raw.body : "",
        });
        break;
      case "limitation":
        out.push({
          type: "limitation",
          title: typeof raw.title === "string" ? raw.title : undefined,
          body: typeof raw.body === "string" ? raw.body : "",
        });
        break;
      case "pros_cons": {
        const pros = asStringArray(raw.pros).slice(0, 4);
        const cons = asStringArray(raw.cons).slice(0, 4);
        const verdict = typeof raw.verdict === "string" ? raw.verdict : undefined;
        if (pros.length || cons.length) {
          out.push({ type: "pros_cons", pros, cons, verdict });
        }
        break;
      }
      case "action_steps": {
        const rawSteps = Array.isArray(raw.steps) ? raw.steps : [];
        const steps = rawSteps.map(parseStepRow).filter((x) => x !== null).slice(0, 7);
        if (steps.length) out.push({ type: "action_steps", steps });
        break;
      }
      case "tips": {
        const rawTips = Array.isArray(raw.tips) ? raw.tips : [];
        const tips = rawTips.map(parseTipRow).filter((x) => x !== null).slice(0, 4);
        if (tips.length) out.push({ type: "tips", tips });
        break;
      }
      case "comparison": {
        const headers = asStringArray(raw.headers).slice(0, 4);
        const rawRows = Array.isArray(raw.rows) ? raw.rows : [];
        const rows = rawRows.map(parseComparisonRow).filter((x) => x !== null).slice(0, 5);
        if (headers.length && rows.length) {
          out.push({ type: "comparison", headers, rows });
        }
        break;
      }
      case "limitations": {
        const cannotDo = typeof raw.cannotDo === "string" ? raw.cannotDo : "";
        const canDo = asStringArray(raw.canDo);
        const st = Array.isArray(raw.suggestedTools)
          ? raw.suggestedTools
              .map((t) => {
                if (!isRecord(t)) return null;
                const name = typeof t.name === "string" ? t.name : "";
                const url = typeof t.url === "string" ? t.url : undefined;
                if (!name) return null;
                return { name, url };
              })
              .filter((x): x is { name: string; url?: string } => x !== null)
          : undefined;
        if (cannotDo.trim() || canDo.length) {
          out.push({ type: "limitations", cannotDo, canDo, suggestedTools: st });
        }
        break;
      }
      case "sources": {
        const rawSrc = Array.isArray(raw.sources) ? raw.sources : [];
        const sources = rawSrc.map(parseSourceChip).filter((x) => x !== null);
        if (sources.length) out.push({ type: "sources", sources });
        break;
      }
      case "follow_up":
        out.push({
          type: "follow_up",
          question: typeof raw.question === "string" ? raw.question : "",
          prefill: typeof raw.prefill === "string" ? raw.prefill : undefined,
        });
        break;
      default:
        break;
    }
  }
  return out.length ? out : undefined;
}

/** Structured formatter output — `prep_type` on the row covers adaptive until result exists. */
export function primaryKindFromResult(
  result: Record<string, unknown> | null | undefined,
): string | undefined {
  if (!result || typeof result.primaryKind !== "string") return undefined;
  return result.primaryKind;
}
