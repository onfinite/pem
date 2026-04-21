import type { MessageLinkContentType } from '../../database/schemas';

export function classifyLinkContentPrompt(params: {
  normalizedUrl: string;
  host: string;
  markdownExcerpt: string;
  hintRestrictedSocial: boolean;
}): string {
  const socialNote = params.hintRestrictedSocial
    ? '\nNote: This host is often login-gated; if the excerpt is empty or only a login wall, set content_type to "social" and explain in structured_summary.\n'
    : '';

  return `
You classify a web page the user shared (markdown from a reader). Return JSON matching the schema.

URL: ${params.normalizedUrl}
Host: ${params.host}
${socialNote}
Markdown excerpt:
"""
${params.markdownExcerpt}
"""

Rules:
- content_type: one of product | article | job | restaurant | video | social | general
- product: shopping, price, buy, SKU, Amazon-style pages
- article: news, blog, editorial, Substack, Medium
- job: careers, job listing, Greenhouse, Lever, company /jobs
- restaurant: Yelp, Maps place, menu, reservations
- video: YouTube, Vimeo when the page is primarily a video
- social: Twitter/X threads, Instagram, TikTok posts, Facebook posts when content is the post itself
- general: anything else

structured_summary: 2-3 short sentences the assistant can read aloud. If paywalled or login-only, say what is visible (title/headline only) and that full text was not readable.

extracted_metadata: a flat JSON object with type-specific fields when possible:
- product: product_name, price, store, image_url (strings, use null if unknown). For image_url prefer a direct https URL to the main product photo; if the markdown shows ![...](https://...) or an obvious product image URL, copy that exact URL into image_url.
- article: outlet, headline (strings)
- job: company, role, location, salary (strings)
- restaurant: name, cuisine_or_type, location, price_range (strings)
- video: title, channel (strings)
- social: platform (string)
- general: title (string)

Use null for unknown fields. Do not invent prices or employers not supported by the excerpt.
`.trim();
}

/** Post-process: coerce invalid model output to general. */
export function coerceLinkContentType(raw: string): MessageLinkContentType {
  const allowed: MessageLinkContentType[] = [
    'product',
    'article',
    'job',
    'restaurant',
    'video',
    'social',
    'general',
  ];
  const t = raw.trim().toLowerCase();
  if (allowed.includes(t as MessageLinkContentType))
    return t as MessageLinkContentType;
  return 'general';
}
