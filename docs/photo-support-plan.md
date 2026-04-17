# Photo support in Pem — planning document

This document is the implementation plan for WhatsApp-style photo attachments: direct upload to object storage, GPT-4o vision analysis, agent extraction/recall, and React Native UX. **No code** — design and decisions only.

**References:** Align with `pem-backend.mdc`, `pem-coding-standards.mdc`, and `pem-core-loop.mdc`. There is no separate `pem-chat.mdc` in the repo today; when this ships, update `pem-backend.mdc` + README in the same effort.

---

## Baseline (today)

- **Voice:** `POST /chat/voice` uploads through NestJS (Multer) → Cloudflare R2 (`StorageService.upload`), `audio_key`, transcription, BullMQ `chat` job.
- **R2:** S3-compatible; `upload` + `getSignedUrl` (GET). No presigned PUT yet.
- **Messages:** `kind`: `text` | `voice` | `brief` | `reflection`; `content`, `transcript`, `voice_url`, `audio_key`, `metadata` jsonb.
- **Orchestrator:** `content` from transcript/content; **empty →** *"I couldn't understand that"* — photo-only must produce a **text surrogate** (vision summary) before that check.
- **Embeddings:** `embedChatMessageIfAbsent` is text-only; RAG = query embedding vs `message_embeddings`.
- **Agent history:** `getRecentMessages` uses `content ?? transcript` only — no image URLs yet.

---

## 1. Storage

**Recommendation:** **Cloudflare R2** (existing account), S3 API, **key prefix** `chat-images/{userId}/{uuid}.{ext}` — optional separate bucket `pem-images` for isolation.

**Direct upload:**

1. Authenticated **`POST /chat/photos/upload-url`** returns `upload_url` (presigned **PUT**), `image_key`, expiry.
2. Extend **`StorageService`** with `getPresignedPutUrl` (`PutObjectCommand` + presigner), MIME allowlist, max size validated at presign time.
3. **Naming:** Include `userId` in path; UUID to avoid collisions.
4. **Retention v1:** Indefinite (aligned with chat), unless you add lifecycle for abandoned uploads later.

**Infra:** R2 **CORS** for app origins and `PUT`; document in README.

**Tradeoffs:** Signed GET URLs (current voice pattern) vs public CDN — decide before build.

---

## 2. Database changes

**Extend `MESSAGE_KINDS`** with **`image`** (or `photo` — pick one globally).

**Columns (recommended):**

| Column | Purpose |
|--------|---------|
| `image_keys` | jsonb array of `{ key, mime?, width?, height? }` — v1 length 1 |
| `vision_summary` | Rich text for RAG + agent |
| `vision_model` | e.g. `gpt-4o` |
| `vision_completed_at` | Pipeline / UI |

**Caption:** Use existing **`content`** for user caption; no duplicate `image_caption` unless product insists.

**Separate `photos` table:** Optional — use if multi-image per message in v2; **v1 can stay on `messages`**.

**Embeddings:** Still one **`message_embeddings`** row per message; embedding string = caption + vision summary (see §3).

---

## 3. Backend — upload flow

1. Client **`POST /chat/photos/upload-url`** → presigned PUT.
2. Client **PUT** file to R2.
3. Client **`POST /chat/messages`** with `kind: 'image'`, optional `content` (caption), `image_key` / `image_keys`, idempotency unchanged.
4. Enqueue existing **`chat-msg:{id}`** job.
5. **Orchestrator — order matters:** For image messages, run **vision** first (load object from R2 server-side), write **`vision_summary`**, then build **pipeline `content`** = caption + vision (or vision-only). **Then** `content.trim()` / moderation / triage / agent — same pipeline as text.
6. **`queueUserMessageEmbedding`** uses **composite searchable text** (e.g. `[Photo] …` + summary).

**Vision location:** Either **inline in `ChatOrchestratorService`** (simpler) or **separate Bull queue** (better for long timeouts) — product decision.

**API sketch:**

- `POST /chat/photos/upload-url` → `{ upload_url, image_key, expires_in_seconds }`
- `POST /chat/messages` extensions for `kind: 'image'` + keys.

---

## 4. Backend — vision analysis

- **Model:** **`gpt-4o`** (recommended for receipts/handwriting); mini optional with fallback — cost vs quality tradeoff.
- **Structured output:** `generateText` + **`Output.object({ schema })`** (Zod) — fields such as:
  - `summary` — retrieval-rich description
  - `visible_text` — transcribed text in reading order (empty if none)
  - `doc_type` — `receipt` | `whiteboard` | `business_card` | `screenshot` | `photo` | `other`
  - `is_readable` / `confidence` — for downstream copy and edge handling
- **OCR:** **Single vision call** asking for verbatim visible text; **no separate Tesseract v1** unless metrics show gaps.
- **Prompt:** Instruct concrete nouns, brands, scene; transcribe embedded text faithfully; **if illegible, say so explicitly** (see §9 handwriting).

**Persistence:** Flatten into **`vision_summary`** for embedding; optional structured blob in **`metadata`** for UI.

### Handwriting specifically

Whiteboards and notebooks often fail partial reads. The model should return:

- **`visible_text`**: best-effort transcription; use `[illegible]` or omit words it cannot read rather than hallucinating.
- **`handwriting_quality` or flags** in schema (optional): `clear` | `partial` | `unreadable`

**Product behavior when handwriting cannot be read:**

1. **Partial:** Pem acknowledges what was read, lists gaps (*"I can make out X and Y, but the rest of the handwriting is too unclear"*), suggests **retake** (lighter, closer, higher contrast) or **type the missing part**.
2. **Unreadable:** Pem does **not** invent tasks from guessed text; offers the same retake/type guidance; can still **save a memory line** (*"You shared a photo of notes — I couldn’t read the writing clearly"* + thumbnail path for recall) so *"that whiteboard photo"* remains findable by **date + user description**, not by bogus OCR.
3. **RAG:** Embed **`vision_summary`** that explicitly says *handwriting illegible* so semantic search doesn’t rely on fake content.

---

## 5. Backend — agent changes

- Agent receives **text only** v1: composite **user message** built from caption + **`vision_summary`** (+ optional `visible_text` block).
- **Triage** uses same composite string.
- **Photo-only:** After vision, non-empty surrogate → normal routes.
- **Responses:** Standard Pem text bubbles; optional **`metadata`** on assistant messages for structured recall (see §6).
- **Split files** if orchestrator grows past standards (`photo-vision.service.ts`, small helpers).

---

## 6. Photo recall

1. User question → embed query → **`similaritySearch`** (existing RAG).
2. Hits must include **vision-rich** user message embeddings (§3).
3. Load **`messages`** for top hits; generate **signed GET URLs** for `image_key`(s).
4. **Assistant reply:** Prefer **`metadata`** on Pem message: `photo_recall: [{ message_id, image_key, signed_url }]` (up to **3** matches) so the client renders thumbnails without markdown URLs in prose.
5. **Multiple matches:** Pem names the top few; UI shows small carousel.
6. **Vague query:** Pem asks for specificity (*"Which one — the receipt or the pipe photo?"*) without inventing images.

---

## 7. React Native — camera and picker

- **`expo-image-picker`** (camera + library).
- **`expo-image-manipulator`** — resize/compress before upload (recommended).
- **Camera icon** next to mic in **`ChatInput`** — extract hooks/sheets to respect **150-line** component limit.
- **Flow:** presign → PUT → `POST /chat/messages` → optimistic local row + SSE for status.
- **States:** uploading | analyzing | done (align with `processing_status` / `message_updated`).

---

## 8. React Native — displaying photos

- Thumbnails in user bubbles; **tap → fullscreen** (lightweight modal or small dependency).
- Pem recall: render thumbnails from **`metadata.photo_recall`**; **refresh signed URLs** if expired (refetch message or small refresh endpoint).
- **Failures:** Retry upload; **retry vision** endpoint or re-enqueue if analysis failed.

---

## 9. Edge cases

| Scenario | Planned behavior |
|----------|------------------|
| Photo only, no caption | Vision summary drives triage/agent; Pem responds normally. |
| Blurry / unreadable image | Low confidence in schema; honest reply + retake; no fake extraction. |
| **Handwriting unreadable** | See §4 — partial vs unreadable; never hallucinate tasks; optional memory + recall by date/context. |
| Sensitive content | **Moderation** on caption + `vision_summary` (existing text moderation path). |
| Large files | Client resize + server max bytes on presign. |
| Multiple photos one message | **v1:** single image recommended; multi deferred or second message. |
| Upload fails | No message row until PUT succeeds **or** explicit `pending_upload` design — prefer **message only after successful upload**. |
| Vague recall | Clarifying question; no fabricated matches. |

---

## 10. Build order

1. R2 CORS + presigned PUT + `StorageService`.
2. DB migration (`kind`, image + vision columns).
3. `POST /chat/photos/upload-url` + extend `POST /chat/messages` + list/sign URLs for GET history.
4. Orchestrator: vision step **before** empty-content check; moderation; embedding composite text.
5. Agent / triage prompt tweaks (small prompt files).
6. Recall: `metadata` contract + question path context.
7. Mobile: picker → upload → send → bubbles + fullscreen.
8. Docs: README env, `pem-backend.mdc`, limits.

**Parallel:** Infra + schema while API contracts are reviewed.

---

## Open decisions (before implementation)

1. `kind` name: `image` vs `photo`; v1 **single vs multi** attachment.
2. Same R2 bucket + prefix vs dedicated bucket; signed GET only vs public CDN thumbnails.
3. Vision: **inside** `chat` worker vs **separate** queue.
4. Recall: **metadata + signed URLs** vs other contract (see §6).
5. Vision model: **gpt-4o** only vs mini + fallback.
6. Add **`pem-chat.mdc`** or fold chat+media rules into `pem-backend.mdc` + short README section.

---

## Revision

- **v1 — 2026-04-16:** Initial plan document; handwriting / whiteboard behavior folded into §4 and §9.
