# Chat message pipeline

End-to-end reference for how a user message moves through the mobile app and NestJS backend, and how live replies arrive. Use this when debugging sends, SSE, BullMQ jobs, or offline cache.

**Diagrams:** Mermaid renders in GitHub, many IDEs, and some Markdown previewers. If a diagram does not render, the same information is still spelled out in the tables and sections below.

## Contents

- [Visual overview](#visual-overview) — layered system, lifecycle, sends, backend job, orchestrator routing, SSE types, pagination vs cache
- [Architecture overview (sequence)](#architecture-overview-sequence) — request/response timeline
- [Client: screen, cache, and stream](#client-screen-cache-and-stream)
- [Client send flows](#client-send-flows)
- [Backend: HTTP → DB → queue](#backend-http--db--queue)
- [Backend: orchestration](#backend-orchestration)
- [Debugging cheat sheet](#debugging-cheat-sheet)
- [File index](#file-index)

---

## Visual overview

### End-to-end system (layers)

Who talks to whom at a glance: one **HTTP** path for sends and history, one **long-lived SSE** path for live Pem output, **Postgres** for messages, **R2** for blobs, **Redis** for SSE fan-out (typical Pem setup).

```mermaid
flowchart TB
  subgraph Mobile["Expo app (React Native)"]
    CHAT["ChatScreen\nchat.tsx"]
    PEM["pemApi + uploadChatImage"]
    STREAM["useChatStream\nEventSource"]
    STORE["AsyncStorage +\nchatCachePersistedImages"]
  end

  subgraph API["NestJS HTTP"]
    CTRL["ChatController\n/messages /voice /stream"]
    SVC["ChatService\nDrizzle → Postgres"]
  end

  subgraph Worker["BullMQ worker"]
    PROC["ChatProcessor"]
    ORCH["ChatOrchestratorService"]
  end

  subgraph Infra["Infra"]
    PG[("Postgres")]
    R2[("Object storage\n(e.g. R2)")]
    REDIS[("Redis\npub/sub + queue")]
  end

  CHAT --> PEM
  CHAT --> STREAM
  CHAT --> STORE
  PEM --> CTRL
  STREAM --> CTRL
  CTRL --> SVC
  CTRL --> R2
  SVC --> PG
  CTRL --> REDIS
  REDIS --> PROC
  PROC --> ORCH
  ORCH --> PG
  ORCH --> R2
  ORCH --> REDIS
```

### Chat screen lifecycle (open app → warm state)

Cold start favors perceived speed: **disk cache first**, then **network reconcile**, **SSE** stays up for the session.

```mermaid
flowchart TD
  M[Mount ChatScreen] --> RC["readCache()\nAsyncStorage + hydrate paths"]
  RC --> LM["loadMessages()\nGET /chat/messages"]
  LM --> MERGE["mergeServerMessagesWithClientLocals\nkeep local URIs / persisted refs"]
  MERGE --> WC["writeCache()\nlast 50 + persistImages + prune"]
  M --> SSE["useChatStream\nconnect GET /chat/stream"]
  RC --> UI["setMessages\nshow list"]
  LM --> UI
```

### Sending a message (client branches → one HTTP response shape)

All send paths **optimistic UI** first, then **HTTP** replaces the temp row with the real `message.id`, then **SSE** drives status and the Pem bubble.

```mermaid
flowchart TD
  U[User action] --> BR{Path}
  BR -->|Text| HT["handleSendText\n→ sendChatMessage"]
  BR -->|Photos + optional caption| HI["handleSendImage /\nhandleComposerSend\n→ uploadChatImagesAndSend"]
  BR -->|Voice ± photos| HV["handleSendVoice\n→ upload keys if needed\n→ sendVoiceMessage multipart"]

  HT --> OP["Append optimistic row\n_clientStatus: sending"]
  HI --> OP
  HV --> OP

  OP --> HTTP["POST succeeds"]
  HTTP --> REP["Map temp id → server id\n_clientStatus: sent"]
  REP --> ST["statusMap[userMsgId]\nThinking..."]

  ST --> WAIT["SSE: status …"]
  WAIT --> PM["SSE: pem_message\nappend Pem bubble"]
  PM --> CLR["Clear status for\nparent_message_id"]
```

### Backend: request → durable row → async job

The API returns **immediately** after the user row exists and the job is queued; Pem’s reply is **never** on that same HTTP response.

```mermaid
flowchart TD
  R[POST /chat/messages or /chat/voice] --> ID{"idempotency_key\nmatches existing?"}
  ID -->|yes| DEDUP["Return saved row\ndeduplicated: true"]
  ID -->|no| VAL["Validate image keys\nif image / voice+photos"]
  VAL --> SV2["saveMessage\nprocessing: pending"]
  SV2 --> Q["chatQueue.add\nprocess-message"]
  Q --> RES["HTTP 200\nserialize + signed URLs"]

  Q -.->|async| W[ChatProcessor.process]
  W --> MR["mergeRapidMessages\noptional 8s batch"]
  MR --> PM2["orchestrator.processMessage"]
```

### Orchestrator routing (high level)

This is a simplified **decision tree** inside `ChatOrchestratorService.processMessage` after `content` is known (including vision path for images). Real code has extra guards (moderation, missing API key, etc.).

```mermaid
flowchart TD
  START([processMessage]) --> LOAD{"Row OK &\nnot already done?"}
  LOAD -->|no| SKIP[Return / no-op]
  LOAD -->|yes| CONTENT["Resolve content\n(text / transcript / vision)"]
  CONTENT --> MOD{"Moderation\nflagged?"}
  MOD -->|yes| SAFE[Short safe reply]
  MOD -->|no| PHOTO{"Image or\nvoice+photos?"}
  PHOTO -->|yes| INTENT{"Organize /\nextraction intent?"}
  INTENT -->|no| REF["Image reference-only\nreply + light memory"]
  INTENT -->|yes| TRIAGE["Triage on content"]
  PHOTO -->|no| TRIAGE
  TRIAGE --> CAT{"Category"}
  CAT -->|trivial / off_topic| SHORT[Short reply path]
  CAT -->|question_only| ASK["ChatQuestionService.answer"]
  CAT -->|needs_agent| AGENT["RAG + context +\nPemAgent.run +\napplyAgentActions"]
  AGENT --> SAVE["savePemResponse\npem_message SSE"]
  ASK --> SAVE
  SHORT --> SAVE
  REF --> SAVE
  SAFE --> SAVE
```

### SSE event types (client dispatch)

What `dispatchChatSseEvent` listens for and how the UI uses it:

```mermaid
flowchart LR
  E1["pem_message"] --> A1["Append Pem row\nfetchCounts"]
  E2["status"] --> A2["statusMap\nby user messageId"]
  E3["message_updated"] --> A3["Patch field on row"]
  E4["pem_token"] --> A4["Streaming token\nif used"]
  E5["pem_stream_done"] --> A5["End stream UI"]
  E6["tasks_updated"] --> A6["fetchCounts +\ndrawer refresh"]
```

### History pagination vs offline cache

The list in memory can grow as the user scrolls up; **AsyncStorage + disk images** only track the **tail** (last 50 cacheable sent messages after a full `loadMessages()` without `before`).

```mermaid
flowchart TD
  SC["User scrolls to top\nonEndReached"] --> LM["loadMessages(oldest.created_at)\nGET ?before=…"]
  LM --> PRE["Prepend older rows\nmergeServerMessagesWithClientLocals"]
  PRE --> NC["No writeCache\nremote URLs for images"]

  FR["Full refresh\nloadMessages()"] --> MERGE["merge + writeCache"]
  MERGE --> SLICE["Last 50 sent,\nno pending locals"]
  SLICE --> PERS["persistImagesForCacheMessages\n+ prune orphans"]
  PERS --> AS["AsyncStorage JSON"]
```

---

## Architecture overview (sequence)

```mermaid
sequenceDiagram
  participant UI as ChatScreen / ChatInput
  participant API as pemApi
  participant Ctrl as ChatController
  participant DB as ChatService + Postgres
  participant Q as BullMQ chat queue
  participant W as ChatProcessor
  participant Orch as ChatOrchestratorService
  participant SSE as ChatEventsService
  participant App as useChatStream

  UI->>API: sendChatMessage / sendVoiceMessage / uploads
  API->>Ctrl: POST /chat/messages or POST /chat/voice
  Ctrl->>DB: saveMessage (user row)
  Ctrl->>Q: add process-message
  Ctrl-->>API: message JSON + signed media URLs
  API-->>UI: replace optimistic row

  Q->>W: process job
  W->>W: mergeRapidMessages (optional)
  W->>Orch: processMessage
  Orch->>SSE: status, pem_message, …
  SSE-->>App: EventSource
  App->>UI: setMessages / setStatusMap
```

Two lanes at runtime:

1. **HTTP** — send message, paginated history (`GET /chat/messages`).
2. **SSE** — `GET /chat/stream` (authenticated) for Pem replies, processing status, and related events.

---

## Client: screen, cache, and stream

### Entry: `app/app/(app)/chat.tsx`

| Concern | Functions / behavior |
|--------|----------------------|
| Initial paint | `readCache()` → AsyncStorage `@pem/chat_messages_v1` → `hydrateCachedImagePaths` (drops missing disk files from persisted paths). |
| Fresh history | `loadMessages()` → `getChatMessages` from `pemApi`. Without `before`: merges with `mergeServerMessagesWithClientLocals` and calls **`writeCache(merged)`**. With `before`: prepends older page only (no cache write). |
| Live updates | `useChatStream({ onPemMessage, onStatus, onMessageUpdated, onTasksUpdated, … })`. |
| Optimistic sends | `handleSendText`, `handleSendImage`, `handleSendVoice`, `handleComposerSend` (text vs pending photos). |

### HTTP helpers: `app/lib/pemApi.ts`

- `sendChatMessage` → `POST /chat/messages` (JSON: `kind: text | voice | image`, optional `idempotency_key`, image keys, caption).
- `sendVoiceMessage` → `POST /chat/voice` (multipart `audio`, optional `image_keys` JSON).
- `getChatMessages` → `GET /chat/messages?before=&limit=`.
- `requestPhotoUploadUrl` → `POST /chat/photos/upload-url` (presigned PUT for R2).

### Image upload path: `app/lib/uploadChatImage.ts`

- `uploadPendingChatImageKeys` — presign + `PUT` each local URI.
- `uploadChatImagesAndSend` — uploads then `sendChatMessage({ kind: "image", image_keys, content? })`.

### SSE: `app/hooks/useChatStream.ts` + `app/hooks/chatStream/`

- `openChatStreamConnection` — `EventSource` to `{API}/chat/stream` with `Authorization: Bearer <Clerk JWT>`.
- `dispatchChatSseEvent` — parses JSON by event type: `pem_message`, `status`, `message_updated`, `pem_token`, `pem_stream_done`, `tasks_updated`.

### Offline slice and disk images

- **AsyncStorage**: last **50** “cacheable” sent messages (no optimistic-only fields blocking cache) — see `CACHE_LIMIT` and `writeCache` in `chat.tsx`.
- **Disk**: `app/lib/chatCachePersistedImages.ts` — downloads user chat images and Pem photo-recall thumbnails under `documentDirectory/pem-chat-images/v1/`, attaches `_persistedImageUris` / `_persistedPhotoRecall` to cached JSON, **prunes** files not referenced by that slice after each persist pass.

---

## Client send flows

### Text

1. `handleSendText` appends optimistic row (`temp-text-*`, `_clientStatus: "sending"`).
2. `sendChatMessage({ kind: "text", content })`.
3. On success: replace temp id with server `message.id`, `_clientStatus: "sent"`, set `statusMap[message.id] = "Thinking..."`.
4. On failure: `_clientStatus: "failed"`.

### Images (with optional caption)

1. `handleSendImage` / composer with pending photos: optimistic row with `_localUri` / `_pendingLocalUris`.
2. `uploadChatImagesAndSend` → then same replace + status map as text.

### Voice (optional composer photos first)

1. `handleSendVoice` may call `uploadPendingChatImageKeys` then `sendVoiceMessage(audioUri, …, { image_keys })`.
2. Optimistic `temp-voice-*` with `_localUri` for playback until server returns.
3. Same success/failure pattern; on failure, pending composer images can be restored from snapshot.

---

## Backend: HTTP → DB → queue

### Controller: `backend/src/modules/chat/chat.controller.ts`

| Route | What happens |
|-------|----------------|
| `POST /chat/photos/upload-url` | Presigned PUT; key scoped under user (R2). Throttled. |
| `POST /chat/messages` | Optional **idempotency**: `findMessageByIdempotencyKey` → return existing + `deduplicated: true`. **Text**: triage classify → `saveMessage` → enqueue `process-message`. **Image**: validate keys → `saveMessage` → enqueue (triage runs later in orchestrator after vision path). **Voice** (JSON body): same pattern as text if used; primary voice path is multipart route below. |
| `POST /chat/voice` | Transcribe audio → optional R2 upload → `saveMessage` → triage on transcript → update row → enqueue. |
| `GET /chat/messages` | Paginated list; each row serialized + signed media URLs attached. |
| `GET /chat/stream` | SSE subscription for user (see `ChatStreamService`). |

### Persistence: `backend/src/modules/chat/services/chat.service.ts`

- `saveMessage` — insert user (or Pem) row.
- `getMessages` — cursor `before` on `created_at`, limit clamped (default 50, max 100), chronological page.
- `updateMessage`, `findMessage`, `findMessageByIdempotencyKey`, `serializeMessage`, etc.

### Queue: `backend/src/modules/chat/jobs/chat.processor.ts`

- Job payload: `{ messageId, userId }`.
- **`mergeRapidMessages`** — within `BATCH_WINDOW_MS` (8s, `constants/chat.constants.ts`), other **pending** user messages from same user may be **merged into this job’s primary** `content`; peers marked `processing_status: 'done'` so their jobs no-op.
- Then **`ChatOrchestratorService.processMessage(messageId, userId, { isFinalAttempt })`**.

---

## Backend: orchestration

### `backend/src/modules/chat/services/chat-orchestrator.service.ts` — `processMessage` (conceptual order)

1. Load message; guard user, skip if already `done`.
2. Set `processing`, publish SSE status (`Processing...`).
3. Resolve **content**: plain text/transcript; for **`kind === 'image'`** or **voice + `imageKeys`**, run **`resolveImagePipelineContent`** (vision / caption pipeline).
4. Empty content → short fallback reply via `savePemResponse`.
5. **Moderation** — if flagged, safe reply + embed user line; return.
6. **Image reference-only** branch — if photo message and not “organize into inbox” intent → `imageReferenceOnlyReply` (+ optional lightweight memory); return.
7. **Triage** again on final `content` (with special-case escalation from `question_only` to `needs_agent` for certain habit language).
8. **`trivial`** / **`off_topic`** / **`question_only`** — short paths; `question_only` uses `ChatQuestionService.answer`.
9. **`needs_agent`** — gather context (RAG, calendar, lists, photo recall strip metadata, etc.), `PemAgentService.run`, **`applyAgentActions`**, then **`savePemResponse`** with optional `metadata` (e.g. `photo_recall`).

### `savePemResponse` (same file)

- Inserts **Pem** `messages` row (`parent_message_id` = triggering user message).
- Marks **user** message `processing_status: 'done'`.
- Fire-and-forget Pem message embedding.
- **`chatEvents.publish(userId, 'pem_message', { message })`** — client appends bubble.
- Push: `notifyChatReply` (Expo); the app suppresses banner/sound for `chat_reply` when **Chat is focused and the app is active** (`chatPushPresence` + `AppState`); minimized/closed or another tab open still surfaces the notification.

### `publishStatus`

- `chatEvents.publish(userId, 'status', { messageId, text })` — client shows under **user** message until Pem completes.

### Related modules (by concern)

- Triage: `backend/src/modules/chat/services/triage.service.ts`
- Question path: `backend/src/modules/chat/services/chat-question.service.ts`
- Vision / photo intent / recall: `backend/src/modules/chat/services/photo-vision.service.ts`, `photo-attachment-intent.service.ts`, `chat-photo-recall-intent.service.ts`, `backend/src/modules/chat/helpers/build-photo-recall-metadata.ts`, `backend/src/modules/chat/services/image-reference-only-reply.service.ts`
- Agent + tool output: `backend/src/modules/chat/services/pem-agent.service.ts` (delegates to injectable `PemAgentLlmService` in `services/pem-agent-llm.service.ts`; system strings in `services/pem-agent.system-prompt.ts`)
- RAG / limits: `backend/src/modules/chat/constants/chat.constants.ts` (`AGENT_RECENT_MESSAGES_LIMIT`, `RAG_*`, `BATCH_WINDOW_MS`, …)

---

## Debugging cheat sheet

| Symptom | Likely cause |
|--------|----------------|
| Bubble stuck on “sending” | Network/auth failure in `sendChatMessage` / `sendVoiceMessage` / upload; check `apiFetch` and Clerk token. |
| “Sent” but no Pem reply | Worker not running, Redis/BullMQ misconfig, job throwing (processor logs), or orchestrator early-return. |
| Status line stuck | SSE disconnected or no final `pem_message`; `statusMap` keyed by **user** message id. |
| Duplicate Pem lines | Rare race; client dedupes `onPemMessage` by `msg.id`. |
| Rapid sends “wrong” merge | `mergeRapidMessages` within 8s window; only `pending` peers. |
| Cold start thumbnails missing | Cache not written yet or files pruned; `readCache` + `loadMessages` order. |
| Old history images remote-only | By design: only tail slice gets `persistImagesForCacheMessages` + AsyncStorage. |

---

## File index

| Area | Path |
|------|------|
| Chat screen + cache + sends | `app/app/(app)/chat.tsx` |
| API client | `app/lib/pemApi.ts` |
| Image upload | `app/lib/uploadChatImage.ts` |
| Cached images on disk | `app/lib/chatCachePersistedImages.ts` |
| SSE hook + connection | `app/hooks/useChatStream.ts`, `app/hooks/chatStream/openChatStreamConnection.ts`, `app/hooks/chatStream/dispatchChatSseEvent.ts` |
| Chat HTTP + SSE | `backend/src/modules/chat/chat.controller.ts`, `backend/src/modules/chat/services/chat-stream.service.ts` |
| DB access | `backend/src/modules/chat/services/chat.service.ts` |
| Worker | `backend/src/modules/chat/jobs/chat.processor.ts` |
| Orchestrator | `backend/src/modules/chat/services/chat-orchestrator.service.ts` |
| SSE pub/sub | `backend/src/modules/chat/services/chat-events.service.ts` (`ChatEventsService`) |

---

## Related product docs

- Photo UX / rollout notes (if present): `docs/photo-support-plan.md`

When behavior or routes change, update **this file** in the same change so launch debugging stays accurate.
