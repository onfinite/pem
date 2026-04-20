/** Markers for dual-layer vision text in `messages.vision_summary` (search + agent detail). */
export const PEM_VISION_FOCUS = '<<<PEM_VISION_FOCUS>>>';
export const PEM_VISION_DETAIL = '<<<PEM_VISION_DETAIL>>>';

/**
 * Persist human-facing recap plus full retrieval text in one column.
 * Do not use these marker strings inside model-generated body text.
 */
export function encodePhotoVisionStored(focus: string, detail: string): string {
  const d = detail.trim();
  const f = focus.trim();
  if (!d) return f;
  if (!f) return d;
  return `${PEM_VISION_FOCUS}\n${f}\n${PEM_VISION_DETAIL}\n${d}`;
}

/** One line for chat history / thumbnails / Ask-mode snippets (focus when present). */
export function visionLineForHumans(raw: string): string {
  const { focus, detail } = decodePhotoVisionStored(raw);
  return (focus ?? detail).trim();
}

export function decodePhotoVisionStored(raw: string): {
  focus: string | null;
  detail: string;
} {
  const t = raw.trim();
  if (!t) return { focus: null, detail: '' };
  const dIdx = t.indexOf(PEM_VISION_DETAIL);
  if (dIdx === -1 || !t.startsWith(PEM_VISION_FOCUS)) {
    return { focus: null, detail: t };
  }
  const afterFocusHeader = t.slice(PEM_VISION_FOCUS.length).trimStart();
  const focusEnd = afterFocusHeader.indexOf(PEM_VISION_DETAIL);
  if (focusEnd === -1) {
    return { focus: null, detail: t };
  }
  const focus = afterFocusHeader.slice(0, focusEnd).trim();
  const detail = afterFocusHeader
    .slice(focusEnd + PEM_VISION_DETAIL.length)
    .trim();
  return {
    focus: focus.length > 0 ? focus : null,
    detail: detail.length > 0 ? detail : t,
  };
}
