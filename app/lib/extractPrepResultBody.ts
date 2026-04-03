import { formatKeyPointsMarkdown, formatSourcesMarkdown } from "./prepBodyMarkdown";

/**
 * Maps API `result` JSON to detail body / draft fields. Kept pure for tests.
 * Handles search shape `{ answer, sources }` even when prep is research (Zod union + formatter quirks).
 * Key points / sources use markdown links for URLs so the detail view shows tappable links.
 */
export function extractPrepResultBody(
  result: Record<string, unknown> | null | undefined,
  renderOrPrep: string,
  status: string,
): {
  body?: string;
  draftText?: string;
  detailIntro?: string;
  draftSubject?: string | null;
} {
  const r = result;
  if (!r || status === "prepping") {
    return {};
  }

  if (Array.isArray(r.blocks) && r.blocks.length > 0) {
    return {};
  }

  if (renderOrPrep === "draft") {
    const body = typeof r.body === "string" ? r.body : "";
    const subject = r.subject === null || typeof r.subject === "string" ? r.subject : null;
    const tone = typeof r.tone === "string" ? r.tone : "";
    const detailIntro =
      [subject ? `Subject: ${subject}` : null, tone ? `Tone: ${tone}` : null].filter(Boolean).join("\n") ||
      undefined;
    return {
      draftText: body,
      draftSubject: subject,
      detailIntro,
    };
  }

  if (renderOrPrep === "options") {
    return {};
  }

  if (Array.isArray(r.sections)) {
    const sections = r.sections.filter(
      (s): s is { type: string; body: string } =>
        s !== null &&
        typeof s === "object" &&
        typeof (s as { body?: unknown }).body === "string" &&
        typeof (s as { type?: unknown }).type === "string",
    );
    if (sections.length) {
      const text = sections
        .map((s) => s.body.trim())
        .filter(Boolean)
        .join("\n\n");
      return { body: text };
    }
  }

  const summaryFromResult = typeof r.summary === "string" ? r.summary : "";
  const answer = typeof r.answer === "string" ? r.answer : "";
  const mainText = summaryFromResult.trim() || answer.trim();

  const keyPoints = Array.isArray(r.keyPoints)
    ? r.keyPoints.filter((x): x is string => typeof x === "string")
    : [];
  const sources = Array.isArray(r.sources)
    ? r.sources.filter((x): x is string => typeof x === "string")
    : [];

  const isResearch = renderOrPrep === "research";
  const parts: string[] = [];
  if (mainText) parts.push(mainText);
  if (keyPoints.length) {
    parts.push(formatKeyPointsMarkdown(keyPoints, isResearch ? "research" : "search"));
  }
  if (sources.length) {
    parts.push(formatSourcesMarkdown(sources));
  }

  const joined = parts.join("");
  if (!joined.trim()) {
    return {};
  }
  return { body: joined };
}
