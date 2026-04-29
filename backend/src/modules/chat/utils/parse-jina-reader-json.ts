import type {
  JinaSnapshotExternalGroup,
  JinaSnapshotStored,
} from '@/modules/chat/types/jina-snapshot-stored.types';

function isExternalShape(v: unknown): v is JinaSnapshotExternalGroup {
  if (!v || typeof v !== 'object') return false;
  return true;
}

/** Parse Jina Reader `Accept: application/json` body into a storable snapshot shape. */
export function parseJinaReaderJsonBody(
  text: string,
): JinaSnapshotStored | null {
  try {
    const o = JSON.parse(text) as { data?: unknown };
    if (!o || typeof o !== 'object' || !o.data || typeof o.data !== 'object') {
      return null;
    }
    const d = o.data as Record<string, unknown>;
    const externalRaw = d.external;
    return {
      data: {
        title: typeof d.title === 'string' ? d.title : undefined,
        description:
          typeof d.description === 'string' ? d.description : undefined,
        url: typeof d.url === 'string' ? d.url : undefined,
        content: typeof d.content === 'string' ? d.content : undefined,
        external: isExternalShape(externalRaw) ? externalRaw : undefined,
        metadata:
          d.metadata &&
          typeof d.metadata === 'object' &&
          !Array.isArray(d.metadata)
            ? (d.metadata as Record<string, unknown>)
            : undefined,
      },
    };
  } catch {
    return null;
  }
}
