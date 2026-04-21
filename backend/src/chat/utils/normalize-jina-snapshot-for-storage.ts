import { LINK_JINA_CONTENT_MAX_CHARS } from '../link-reading.constants';
import type { JinaSnapshotStored } from '../types/jina-snapshot-stored.types';

function capContent(content: string): string {
  if (content.length <= LINK_JINA_CONTENT_MAX_CHARS) return content;
  return `${content.slice(0, LINK_JINA_CONTENT_MAX_CHARS)}\n\n…`;
}

/** Drop bulky fields; cap `content` for DB + classifier excerpt. */
export function normalizeJinaSnapshotForStorage(
  raw: JinaSnapshotStored,
): JinaSnapshotStored {
  const data = raw.data ?? {};
  const content =
    typeof data.content === 'string' ? capContent(data.content) : undefined;
  return {
    data: {
      title: typeof data.title === 'string' ? data.title : undefined,
      description:
        typeof data.description === 'string' ? data.description : undefined,
      url: typeof data.url === 'string' ? data.url : undefined,
      content,
      external: data.external,
      metadata: data.metadata,
    },
  };
}
