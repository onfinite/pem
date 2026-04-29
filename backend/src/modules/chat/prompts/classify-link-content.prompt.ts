import type { MessageLinkContentType } from '@/database/schemas/index';

export function classifyLinkContentPrompt(params: {
  normalizedUrl: string;
  host: string;
  markdownExcerpt: string;
  descriptionHint: string | null;
  hintRestrictedSocial: boolean;
}): string {
  const socialNote = params.hintRestrictedSocial
    ? '\nNote: This host is often login-gated; if the excerpt is empty or only a login wall, set content_type to "social" and explain in structured_summary.\n'
    : '';

  const descTrimmed = params.descriptionHint?.trim() ?? '';
  const descBlock = descTrimmed.length
    ? `\nPublisher / page description (may repeat the title; use if it adds recall value):\n"""\n${descTrimmed.slice(0, 1500)}\n"""\n`
    : '';

  return `
You classify a web page the user shared so Pem can remember, organize, and help them recall it later — NOT so Pem can act as a researcher, lawyer, or document analyst.

URL: ${params.normalizedUrl}
Host: ${params.host}
${socialNote}${descBlock}
Reader excerpt (markdown/HTML-ish body, truncated):
"""
${params.markdownExcerpt}
"""

Pem's core loop: the user dumps → Pem understands → organizes → remembers → they recall ("that sleep article", "those headphones I saved", "the pasta recipe", "that Stripe job").

Your job:
1) Pick content_type (one):
- product — buyable item, Amazon/shop, price/SKU context
- article — news, blog, editorial, newsletter, forum thread worth remembering for substance
- recipe — cooking: ingredients, steps, yields, timings (food sites, blogs with a recipe card)
- job — careers listing, Greenhouse/Lever/company /jobs
- restaurant — Yelp, Maps place, reservations
- video — page is primarily one video (YouTube/Vimeo watch pages)
- social — post/thread as the main object when login-gated or thin
- general — anything else that still deserves a short memory note

2) structured_summary: exactly 2–3 short sentences a human assistant would read aloud. Capture what matters for recall and light organization (topic, stakes, who/what/when if obvious). This is NOT a research brief, legal analysis, or multi-source synthesis.

3) extracted_metadata: flat JSON, type-specific when obvious (use null for unknowns; never invent prices/employers):
- product: product_name, price, store, image_url (https product image URL from excerpt if clear)
- article: outlet, headline
- recipe: dish_name, cuisine_or_style (string|null), ingredients_or_steps_brief (one tight string: key ingredients OR short step outline, not the whole novel)
- job: company, role, location, salary
- restaurant: name, cuisine_or_type, location, price_range
- video: title, channel
- social: platform
- general: title

Out of scope — do NOT optimize for: terms of service review, contract analysis, comparing multiple articles, fact-checking news, deep product research, or "evaluate this argument." If the page is mostly policy/legal noise, still pick the closest type and summarize only what a busy person would want remembered in one line.

Return JSON matching the schema.
`.trim();
}

/** Post-process: coerce invalid model output to general. */
export function coerceLinkContentType(raw: string): MessageLinkContentType {
  const allowed: MessageLinkContentType[] = [
    'product',
    'article',
    'job',
    'recipe',
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
