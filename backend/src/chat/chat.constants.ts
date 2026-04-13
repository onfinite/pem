/** Minimum cosine similarity (1 - distance) for RAG hits — below this is mostly noise. */
export const RAG_MIN_SIMILARITY = 0.68;

/** Max vector hits to fetch and consider after threshold filter. */
export const RAG_TOP_K = 15;

/** Recent chat messages included in agent context (chronological). */
export const AGENT_RECENT_MESSAGES_LIMIT = 30;

/** Done extracts included for context (days). */
export const DONE_EXTRACTS_LOOKBACK_DAYS = 90;

/** Dismissed extracts included so agent does not re-extract (days). */
export const DISMISSED_EXTRACTS_LOOKBACK_DAYS = 30;

/** BullMQ job id prefix — one active job per message (no `:` — BullMQ forbids it). */
export const CHAT_JOB_ID_PREFIX = 'chat-msg-';

/** Delay for questions/trivial — process immediately (no batching needed). */
export const CHAT_JOB_DELAY_MS_QUESTION = 0;

/** Delay for dumps/commands — short buffer to allow rapid-fire messages to batch. */
export const CHAT_JOB_DELAY_MS_DUMP = 3_000;

/** Legacy alias — used when triage is unavailable (falls back to dump delay). */
export const CHAT_JOB_DELAY_MS = CHAT_JOB_DELAY_MS_DUMP;

/** Window in which pending messages from the same user are merged into one job. */
export const BATCH_WINDOW_MS = 8_000;
