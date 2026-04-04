import type { PrepRow } from '../database/schemas';

export function readContextString(
  ctx: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  if (!ctx || typeof ctx !== 'object') return null;
  const v = ctx[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/** Single JSON shape for list, detail, and SSE — one prep row; no multi-prep nesting. */
export function serializePrepForApi(p: PrepRow): Record<string, unknown> {
  const ctx = p.context && typeof p.context === 'object' ? p.context : null;

  return {
    id: p.id,
    dump_id: p.dumpId,
    title: p.title,
    thought: p.thought || p.title,
    intent: p.intent ?? null,
    prep_type: p.prepType,
    context: p.context,
    status: p.status,
    summary: p.summary,
    result: p.result,
    error_message: p.errorMessage,
    created_at: p.createdAt?.toISOString?.() ?? p.createdAt,
    ready_at: p.readyAt?.toISOString?.() ?? p.readyAt ?? null,
    archived_at: p.archivedAt?.toISOString?.() ?? p.archivedAt ?? null,
    opened_at: p.openedAt?.toISOString?.() ?? p.openedAt ?? null,
    bundle_type: readContextString(ctx, 'bundle_type'),
    bundle_detection_reason: readContextString(ctx, 'bundle_detection_reason'),
    display_emoji: p.displayEmoji ?? null,
    total_sub_preps: null,
    completed_sub_preps: null,
    failed_sub_preps: null,
    sub_preps: null,
  };
}
