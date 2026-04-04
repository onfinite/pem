import { describe, expect, it } from "vitest";

import { extractPrepResultBody } from "./extractPrepResultBody";

describe("extractPrepResultBody", () => {
  it("returns empty while prepping", () => {
    expect(
      extractPrepResultBody({ summary: "x" }, "research", "prepping"),
    ).toEqual({});
  });

  it("maps research result with summary + keyPoints + sources", () => {
    const out = extractPrepResultBody(
      {
        summary: "Main findings.",
        keyPoints: ["a", "b"],
        sources: ["https://a.com", "https://b.com"],
      },
      "research",
      "ready",
    );
    expect(out.body).toContain("Main findings.");
    expect(out.body).toContain("- a");
    expect(out.body).not.toContain("Key points:");
  });

  it("uses answer when summary is missing (search-shaped result for research)", () => {
    const out = extractPrepResultBody(
      {
        answer: "Long narrative that was stored under the search union branch.",
        sources: ["https://example.com"],
      },
      "research",
      "ready",
    );
    expect(out.body).toContain("Long narrative");
    expect(out.body).toMatch(/\[example\.com\]\(https:\/\/example\.com\)/);
  });

  it("keeps Key points / Sources labels for search (non-research)", () => {
    const out = extractPrepResultBody(
      {
        summary: "S",
        keyPoints: ["a"],
        sources: ["https://x.com"],
      },
      "search",
      "ready",
    );
    expect(out.body).toContain("**Key points**");
    expect(out.body).toContain("**Sources**");
    expect(out.body).toMatch(/\[x\.com\]\(https:\/\/x\.com\)/);
  });

  it("prefers result.summary over answer when both exist", () => {
    const out = extractPrepResultBody(
      {
        summary: "From summary field",
        answer: "From answer field",
      },
      "search",
      "ready",
    );
    expect(out.body).toContain("From summary field");
    expect(out.body).not.toContain("From answer field");
  });

  it("maps draft body and subject", () => {
    const out = extractPrepResultBody(
      { subject: "Hi", body: "Text", tone: "brief" },
      "draft",
      "ready",
    );
    expect(out.draftText).toBe("Text");
    expect(out.draftSubject).toBe("Hi");
    expect(out.detailIntro).toContain("Subject: Hi");
    expect(out.detailIntro).toContain("Tone: brief");
  });

  it("returns empty for options (cards render picks)", () => {
    expect(
      extractPrepResultBody({ options: [{ name: "x", price: "1" }] }, "options", "ready"),
    ).toEqual({});
  });

  it("returns empty when composable blocks are present", () => {
    expect(
      extractPrepResultBody(
        {
          primaryKind: "mixed",
          blocks: [{ type: "search", answer: "A", sources: [] }],
          summary: "Would be wrong if merged",
        },
        "mixed",
        "ready",
      ),
    ).toEqual({});
  });
});
