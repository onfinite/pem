/**
 * Composable prep sections — mirrors `backend/src/agents/schemas/prep-result.schema.ts`.
 * Legacy API results omit `blocks` and use a single flat `result` shape instead.
 */

export type PrepOptionRow = {
  name: string;
  price: string;
  url: string;
  store: string;
  why: string;
  imageUrl: string;
};

export type PrepResultBlock =
  | { type: "search"; answer: string; sources: string[] }
  | { type: "research"; summary: string; keyPoints: string[]; sources: string[] }
  | { type: "options"; options: PrepOptionRow[] }
  | { type: "draft"; subject: string | null; body: string; tone: string }
  | { type: "guidance"; title?: string; body: string }
  | { type: "limitation"; title?: string; body: string };

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
      default:
        break;
    }
  }
  return out.length ? out : undefined;
}

export function getPrimaryKindFromResult(
  result: Record<string, unknown> | null | undefined,
): string | undefined {
  if (!result) return undefined;
  if (typeof result.primaryKind === "string") return result.primaryKind;
  return undefined;
}
