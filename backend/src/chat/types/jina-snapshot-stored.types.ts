/**
 * Trimmed Jina Reader JSON (`Accept: application/json`) persisted on `message_links.jina_snapshot`.
 * `data.content` is capped server-side (see link-reading.constants).
 */
export type JinaSnapshotExternalGroup = Record<
  string,
  Record<string, { type?: string }>
>;

export type JinaSnapshotStored = {
  data: {
    title?: string;
    description?: string;
    url?: string;
    content?: string;
    external?: JinaSnapshotExternalGroup;
    metadata?: Record<string, unknown>;
  };
};
