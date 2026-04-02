import { describe, expect, it } from "vitest";

import {
  formatSourcesMarkdown,
  lineToMarkdownBullet,
  linkLabelFromUrl,
} from "./prepBodyMarkdown";

describe("prepBodyMarkdown", () => {
  it("linkLabelFromUrl uses hostname", () => {
    expect(linkLabelFromUrl("https://www.example.com/path")).toBe("example.com");
  });

  it("lineToMarkdownBullet linkifies bare https URL", () => {
    expect(lineToMarkdownBullet("https://news.ycombinator.com")).toBe(
      "- [news.ycombinator.com](https://news.ycombinator.com)",
    );
  });

  it("lineToMarkdownBullet supports title — url", () => {
    expect(lineToMarkdownBullet("HN — https://news.ycombinator.com")).toBe(
      "- [HN](https://news.ycombinator.com)",
    );
  });

  it("formatSourcesMarkdown adds Sources heading and links", () => {
    const s = formatSourcesMarkdown(["https://a.com", "https://b.com"]);
    expect(s).toContain("**Sources**");
    expect(s).toContain("[a.com](https://a.com)");
    expect(s).toContain("[b.com](https://b.com)");
  });
});
