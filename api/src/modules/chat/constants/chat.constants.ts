/** Minimum cosine similarity (1 - distance) for RAG hits — below this is mostly noise. */
export const RAG_MIN_SIMILARITY = 0.68;

/** Floor for image-only recall; weak matches often look “related” but are wrong (e.g. random screenshots). */
export const RAG_IMAGE_RECALL_MIN_SIMILARITY = 0.6;

/** Second-pass image recall when the user clearly asked for past photos but the strict floor returned nothing. */
export const RAG_IMAGE_RECALL_MIN_SIMILARITY_RELAXED = 0.5;

/**
 * After sorting image hits by similarity, drop hits farther than this below the **best** score.
 * Stops a strong match (e.g. kid card) from being paired with a loose also-ran (e.g. todo list).
 */
export const PHOTO_RECALL_STRIP_SCORE_GAP = 0.09;

/** Max image messages to consider for targeted photo recall strip. */
export const RAG_IMAGE_RECALL_TOP_K = 12;

/** Max vector hits to fetch and consider after threshold filter. */
export const RAG_TOP_K = 15;

/**
 * When strict chat RAG returns fewer than this many rows, merge a second semantic
 * pass at RAG_ENRICHMENT_MIN_SIMILARITY so recall does not depend on exact phrasing.
 */
export const RAG_ENRICHMENT_MERGE_TRIGGER_MAX = 6;

/** Looser cosine floor for the optional second text-RAG pass (merged, deduped). */
export const RAG_ENRICHMENT_MIN_SIMILARITY = 0.58;

/** Row cap for the enrichment pass. */
export const RAG_ENRICHMENT_TOP_K = 22;

/**
 * When the user's message implies a calendar window (yesterday, last month, April 12…),
 * add this to cosine similarity for rows whose message `created_at` falls in that window
 * so RAG prefers in-band hits without dropping strong out-of-band matches.
 */
export const RAG_TEMPORAL_WINDOW_BOOST = 0.12;

/** When temporal boost is on, fetch extra vector hits before reranking (cap). */
export const RAG_TEMPORAL_PREFETCH_CAP = 48;

/** Recent chat messages included in agent context (chronological). */
export const AGENT_RECENT_MESSAGES_LIMIT = 30;

/** Done extracts included for context (days). */
export const DONE_EXTRACTS_LOOKBACK_DAYS = 90;

/** Max completed-task rows injected into Ask-mode prompts (all-time or window). */
export const ASK_DONE_EXTRACTS_CAP = 80;

/** BullMQ job id prefix — one active job per message (no `:` — BullMQ forbids it). */
export const CHAT_JOB_ID_PREFIX = 'chat-msg-';

/** Delay for questions/trivial — process immediately (no batching needed). */
export const CHAT_JOB_DELAY_MS_QUESTION = 0;

/** Delay for dumps/commands — process immediately; rapid-fire batching is handled by mergeRapidMessages in the worker. */
export const CHAT_JOB_DELAY_MS_DUMP = 0;

/** Legacy alias — used when triage is unavailable (falls back to dump delay). */
export const CHAT_JOB_DELAY_MS = CHAT_JOB_DELAY_MS_DUMP;

/** Window in which pending messages from the same user are merged into one job. */
export const BATCH_WINDOW_MS = 8_000;

/** Max images attached to a single chat message (user + API). */
export const MAX_CHAT_MESSAGE_IMAGES = 10;

/**
 * Max thumbnails in Pem's "From your photos" strip (one row; each item is one image key).
 * Vector search may still consider more messages; this caps what we return and show.
 */
export const PHOTO_RECALL_STRIP_MAX_ITEMS = 6;

/** Max past image message ids the photo-recall intent model may return. */
export const PHOTO_RECALL_MAX_MESSAGE_IDS = 10;

/** User image rows considered for the photo-recall classifier (too low = older photos never shown). */
export const PHOTO_RECALL_CANDIDATE_LIMIT = 36;

/** Max rows sent to the photo-recall intent LLM (subset of recent ∪ vector union). */
export const PHOTO_RECALL_CLASSIFIER_MAX_CANDIDATES = 28;

/** Extra past photo message ids merged from vector search for the recall classifier. */
export const PHOTO_RECALL_VECTOR_CANDIDATE_EXTRA = 12;

/** Caption + transcript (or plain user line) passed to triage / moderation — not vision-injected agent blobs. */
export const USER_FACING_TRIAGE_MAX_CHARS = 4_000;

/** Max chars for `message_embeddings.content` text before embed (head+tail if longer). */
export const EMBEDDING_INDEX_TEXT_MAX_CHARS = 12_000;

/** Max chars for the memory_facts block injected into agent / Ask prompts. */
export const MEMORY_PROMPT_SECTION_MAX_CHARS = 6_000;
