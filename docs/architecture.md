# Architecture

## Product model

**The loop:** User dumps (voice or text, messy) → Pem extracts actionable items → classifies tone/timing/batch → items land in inbox → user reads, taps for detail, marks done or dismisses.

### Extract tone (every extract gets exactly one)

- **confident** — stated clearly; surfaces normally in inbox
- **tentative** — maybe, thinking about; saved, lower priority
- **someday** — aspirational, no deadline; lives at bottom

Speculative ideas ("what if…") → `memory_write` with `memory_key: "ideas"`, not extracts.
Concrete routines → recurring extract + `memory_write` with `memory_key: "routines"`.
Use `gpt-4o-mini`. When in doubt, classify as **tentative**, not confident.

### Datetime and period handling

- Exact datetimes → `due_at`. Period references → `period_start` + `period_end` + `period_label`.
- Weekend = Saturday AND Sunday. "This week" = Mon–Fri. "Next week" = following Monday.
- All inbox bucketing computed from date anchors (overdue, today, tomorrow, this_week, next_week, etc.).

### Batch keys

`shopping` | `follow_ups` | `null`. `follow_ups` = any task involving contacting someone. Batches show only when 2+ items share `batch_key`. When in doubt, don't batch.

### Inbox UX (Daily Brief)

Pem statement (italic serif, gpt-4o) → overdue (red) → today (amber timeline) → tomorrow → this_week → next_week → later → batch chips → someday.

**States:** `inbox` | `snoozed` | `done` | `dismissed`. No archive.
- **Done** — handled; tracked in done list.
- **Dismissed** — not relevant; recoverable, not shown in done list.

---

## API architecture (`api/`)

### Module layout (`src/`)

| Path | Role |
|------|------|
| `core/auth/` | `ClerkAuthGuard`, `@GetUser()`, JWKS helpers |
| `core/config/` | ConfigService; `OPENAI_API_KEY` and `ALLOWED_ORIGINS` fail-fast if missing |
| `core/bootstrap/` | `configureApp`: CORS, ValidationPipe, ThrottlerGuard |
| `core/utils/` | URL stack (SSRF guard, normalize, regexes), logging, sleep, dedupe |
| `database/schemas/` | Drizzle table definitions — source of truth |
| `modules/chat/` | Thin HTTP: controller, module, dto/, constants, helpers |
| `modules/messages/` | `ChatService`: message CRUD + serialization |
| `modules/messaging/` | SSE (`ChatStreamService`), `ChatEventsService`, triage, `ChatOrchestratorService`, BullMQ jobs |
| `modules/agent/` | `PemAgentService`, `PemAgentLlmService`, `OrchestratorLlmService`, `question/` (Ask path) |
| `modules/memory/` | `EmbeddingsService` (pgvector) |
| `modules/media/` | Voice (Whisper), photo (vision/recall), links (OG HTML reader, `ChatLinkPipelineService`), signed URLs |
| `modules/briefs/` | Morning brief + weekly reflection crons/LLM/processor |
| `modules/extracts/` | Extract CRUD, status transitions |

### Database schema (Drizzle, `src/database/schemas/`)

**`users`** — `timezone` (IANA), `notification_time` (morning brief delivery)

**`messages`** — `role` (`user`|`pem`), `kind` (`text`|`voice`|`brief`|`image`), content, voice_url, transcript, `triage_category`, `processing_status`, polished_text, parent_message_id, image_keys, vision_summary

**`message_links`** — URLs extracted from user messages; 24h user-scoped cache on `normalized_fetch_url`; fields: page_title, structured_summary, extracted_metadata (jsonb, e.g. `image_url`), fetch_status

**`message_embeddings`** — pgvector 1536-dim, FK → messages; idempotent per message_id; stored text format: `[ISO] user:|pem: …`

**`extracts`** — tone, urgency (`someday`|`none`), timing via `period_start`/`period_end`/`due_at`, period_label, batch_key, status, meta (jsonb), calendar event fields, message_id FK

**`calendar_connections`**, **`memory_facts`**, **`logs`**, **`reported_issues`**

### Chat pipeline

```
POST /chat/messages
  → save message row
  → enqueue BullMQ 'chat' job (id: chat-msg:{messageId}, deduped)
  → return immediately (idempotency_key supported)

ChatProcessor (BullMQ, attempts: 3, exponential backoff):
  1. Transcribe   — Whisper in worker for deferred voice; otherwise already on row
  2. Link reading — OG HTML fetch; URL-only messages run before triage; mixed messages
                    only for question_only | needs_agent
  3. Triage       — gpt-4o-mini → trivial | question_only | off_topic | needs_agent
  4. Route:
     trivial       → quick acknowledgment
     off_topic     → short redirect
     question_only → ChatQuestionService (RAG + extracts + memory, gpt-4o)
     needs_agent   → PemAgentService (prompt chaining):
                       pass 1: extraction (creates/updates/completions, low temp, retries + JSON recovery)
                       pass 2: orchestration (response_text, calendar, memory, scheduling)
                       fallback: monolithic single-call if extraction empty + heuristics say actionable
  5. Apply        — creates, updates, completions, calendar_writes, memory_writes
                    Programmatic dedupe: new creates matching open/recently-dismissed task are dropped
  6. Respond      — save Pem message, SSE publish, push notification
  7. Embed        — pgvector in background; head+tail truncation; one retry on failure
```

**Pipeline invariants:**
- Triage + moderation run on user-facing text — not vision-injected blobs
- `mergeRapidMessages` skips when any message has `kind: 'image'` or `image_keys`
- Pipeline skips if `processing_status` is already `done`

**Agent context includes:** open tasks, upcoming timed items, done extracts (last 90d), dismissed (last 30d), last 30 chat messages, memory facts, RAG results, link previews, photo recall when relevant.

### SSE (`GET /chat/stream`)

- `X-Accel-Buffering: no`, heartbeat every 30s (`type: heartbeat`)
- Events: `status`, `pem_message`, `message_updated`, `processing_failed`
- Redis pub/sub via `ChatEventsService` (`chat-events:{userId}`)
- Connections cleaned up on disconnect; Redis enables multi-instance scaling

### AI models

| Use case | Model |
|----------|-------|
| Triage, extraction, classification | `gpt-4o-mini` |
| Agent responses, Ask Pem, morning brief | `gpt-4o` |
| Embeddings | `text-embedding-3-small` |
| Voice transcription | `whisper-1` |

**AI SDK (Vercel AI SDK v6):**

```typescript
import { generateText, Output } from 'ai'

const result = await generateText({
  model: openai('gpt-4o-mini'),
  output: Output.object({ schema: myZodSchema }),
  prompt: '...',
})
// result.output — typed and validated
```

- Use `generateText` + `Output.object({ schema })` with Zod — **never** `generateObject`/`streamObject`
- `Output.array({ element })` for lists, `Output.choice({ options })` for classification, `Output.text()` for plain strings
- If model wraps JSON in markdown fences: `wrapLanguageModel` + `extractJsonMiddleware()`
- `gpt-4o-mini` (~300ms) may be in the request path; `gpt-4o` (3–30s) must go through BullMQ

### BullMQ patterns

```typescript
// Concurrency: cheap jobs high, expensive AI low
const worker = new Worker('embed-messages', processor, { connection: redis, concurrency: 20 })
const agentWorker = new Worker('process-dump', processor, { connection: redis, concurrency: 5 })

// Every job configured with retry
await queue.add('embed-message', payload, {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 500 },
})
```

### Calendar

Google Calendar only. Server-side OAuth via `googleapis`. OAuth `state` is HMAC-signed with `GOOGLE_OAUTH_STATE_SECRET`; callback verifies signature + expiry before `upsertGoogle`.

### Morning brief

`BriefCronService` — hourly cron generates brief at midnight (user local time), saves as `kind: 'brief'` Pem message, delayed push at user's `notification_time`.

### API routes

```
POST /chat/messages           ← JSON (kind: text/voice/image) or multipart with audio field
POST /chat/photos/upload-url  ← presigned PUT for R2 chat-images
GET  /chat/messages           ← paginated (?before=ISO&limit=50)
GET  /chat/stream             ← SSE

GET  /inbox/brief             ← overdue, today, tomorrow, this_week, next_week, later, batch_counts
GET  /inbox
GET  /inbox/all
GET  /inbox/stream?dumpId=    ← SSE after dump

POST /dumps                   ← text dump (extraction pipeline)
POST /dumps/voice
POST /dumps/:id/retry
GET  /dumps, GET /dumps/:id

POST /ask                     ← text Q&A (no dump created)
POST /ask/voice
GET  /ask/history

GET    /extracts/done|open|query|:id|:id/history
PATCH  /extracts/:id/done|dismiss|undone|undismiss|snooze|reschedule
PATCH  /extracts/:id          ← user edit (text, urgency, batch_key, due_at, period_*, tone, etc.)
POST   /extracts/:id/report

PATCH /users/me/timezone
PATCH /users/me/push-token

GET    /calendar/connections
GET    /calendar/google/auth-url
GET    /calendar/google/callback
PATCH  /calendar/connections/:id/primary
DELETE /calendar/connections/:id

GET  /health                  ← { "status": "ok" } (public)
POST /webhooks/clerk          ← Svix-verified
```

**User creation:** API auto-creates a `users` row on first authenticated request from JWT claims.

---

## Mobile app architecture (`mobile-app/`)

### Routing (expo-router)

```
app/
  index.tsx                 ← redirects signed-in → app shell, else /welcome
  (public)/welcome.tsx      ← OAuth (Google + Apple) via Clerk useSSO
  (app)/
    _layout.tsx             ← Stack + AppDrawerProvider; caps MAX_APP_CONTENT_WIDTH on wide viewports
    inbox.tsx               ← Daily Brief (home)
    chat.tsx                ← Chat + Ask Pem
    thoughts/_layout.tsx    ← inner Stack: list → detail (raw dumps)
    done.tsx
    settings/
    category/[slug].tsx     ← batch/category pages
```

**Auth:** Clerk OAuth only (`@clerk/expo` + `expo-auth-session` + `expo-web-browser`). `ClerkProvider` wraps root layout.

### Feature folders

```
components/
  ui/           ← PemText, PemButton, PemTextField
  layout/       ← PemScreen, ScreenScroll
  chat/         ← bubbles/, input/, media/, links/, chrome/, calendar/, TaskPill.tsx
  drawer/       ← tabs/, inbox/, calendar/, edit/, task-item/, feedback/, types.ts, constants.ts
  inbox/        ← TaskDrawer.tsx (re-exports drawer)
  navigation/, auth/, settings/, brand/
services/       ← api/, cache/, media/, push/, links/ (stateful non-UI)
hooks/
  chat/         ← useChatStream + chatStream/
  drawer/       ← useTaskDrawerController, useTaskItemDisplay
  shared/       ← useLists, useMessageSearch, useNetworkStatus
utils/          ← formatting/, text/, images/, guards/ (pure helpers)
lib/            ← buildChatDisplayItems, chat types, pemHaptics, small shared helpers
constants/      ← theme.ts, typography.ts, layout.ts
contexts/       ← ThemeContext (light/dark/system, persisted via AsyncStorage)
```

### API client (`services/api/pemApi.ts`)

Key types: `ApiExtract`, `BriefResponse`, `LogEntry`, `AskPemResponse`, `ExtractsQueryParams`

Key functions: `getBrief`, `getExtractHistory`, `patchExtractDone`/`Dismiss`/`Undone`/`Undismiss`/`Snooze`, `createDump`, `createVoiceDump`, `retryDumpExtraction`, `askPem`, `createVoiceAsk`, `getAskHistory`

### Key components

**InlineVoiceBar** — Dump mode → `POST /dumps`/`POST /dumps/voice`; Ask mode → `POST /ask`/`POST /ask/voice`. Toggle: **? ask** / **× dump**. Callbacks: `onDumpSuccess`, `onDumpCreated`, `onPemResponse`. Modes: idle, recording, paused, text.

**PemResponseSheet** — Slide-up answer sheet, auto-appears from `onPemResponse` in Ask mode.

**Daily Brief (InboxHomeScreen)** — Sections: overdue (red), today (amber timeline), tomorrow, this_week (collapsed), next_week, later, batch chips, someday. Powered by `GET /inbox/brief`.

**ExtractDetailModal** — Detail + change history (`GET /extracts/:id/history`), snooze sheet (later today, tomorrow, weekend, next week, someday), copy/share.

**PushNotificationRegistrar** — registers Expo push token via `PATCH /users/me/push-token`; `inbox_updated` push → deep-links to `/inbox`.

**TimezoneRegistrar** — `PATCH /users/me/timezone` immediately after auth.

### SSE (chat streaming)

`hooks/chat/useChatStream.ts` + `hooks/chat/chatStream/` — uses `react-native-sse` to connect to `GET /chat/stream` after send.

### Inbox UI tokens

`constants/inboxChrome.ts` — light/dark glance surfaces; compose with `ThemeContext`.
