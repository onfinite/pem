import type { ChatLinkPreview } from "@/lib/pemApi";

/** Hostname for inline chat: lowercase, strip www — same cadence as surrounding body text. */
export function chatInlineLinkHostnameNatural(href: string): string {
  try {
    return new URL(href.trim()).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "link";
  }
}

export function linkPreviewDisplayTitle(p: ChatLinkPreview): string {
  if (p.title?.trim()) return p.title.trim();
  try {
    return new URL(p.canonical_url ?? p.original_url).hostname.replace(
      /^www\./,
      "",
    );
  } catch {
    return "Link";
  }
}

export function linkPreviewDisplayDomain(p: ChatLinkPreview): string {
  try {
    return new URL(p.canonical_url ?? p.original_url).hostname
      .replace(/^www\./, "")
      .toUpperCase();
  } catch {
    return "LINK";
  }
}

export function linkPreviewFetchErrorMessage(status: string): string {
  if (status === "unauthorized") {
    return "Preview only — page needs log in";
  }
  if (status === "timeout") {
    return "Preview timed out";
  }
  return "Couldn’t load preview";
}
