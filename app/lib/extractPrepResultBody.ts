import { formatKeyPointsMarkdown, formatSourcesMarkdown } from "./prepBodyMarkdown";

/**
 * Fallback body text when a prep has no `result.blocks` (should be rare — prefer composable blocks).
 */
export function extractPrepResultBody(
  result: Record<string, unknown> | null | undefined,
  prepType: string,
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

  if (prepType === "draft") {
    const body = typeof r.body === "string" ? r.body : "";
    const subject = r.subject === null || typeof r.subject === "string" ? r.subject : null;
    const tone = typeof r.tone === "string" ? r.tone : "";
    const detailIntro =
      [subject ? `Subject: ${subject}` : null, tone ? `Tone: ${tone}` : null].filter(Boolean).join("\n\n") ||
      undefined;
    return {
      draftText: body,
      draftSubject: subject,
      detailIntro,
    };
  }

  if (prepType === "options") {
    return {};
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

  const isResearch = prepType === "research";
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
