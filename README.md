# Pem

Monorepo for the Pem product: a mobile client and HTTP API. The **`app/`** and **`backend/`** trees are separate packages (no shared runtime code between them).

**Brand & color reference:** see **`brand/pem-brand.html`** (open in a browser) and **`brand/README.md`**. The mobile app maps these to `app/constants/theme.ts` and `app/constants/typography.ts`; when in doubt about palette, type, or voice, check the brand kit first.

## What is Pem?

**Pem is your prep work** — not a chatbot you prompt, not a task manager you maintain, not another AI tool that waits for you to show up.

You have a busy mind. Thoughts pile up: the birthday you forgot, the email you’ve been dreading, the idea from the shower, the thing you’ve meant to look into for three weeks. You often can’t act *right now* — no time, energy, or full information — but you can’t let it go either. That unresolved loop is the gap Pem lives in.

**Dump it** — text, anytime. No structure, no prompting. Pem catches it all.

**Pem preps** — it classifies each dump, figures out what work is needed, and fans out to parallel agents (web search, deep research, options with links and prices, drafts you can send). You don’t babysit.

**You act** — come back when you’re ready. Your **preps** are waiting: summarized research, gift options, drafts to review. Mark done. The task is always **yours**; Pem doesn’t send, buy, call, or decide. It does the **thinking in the middle** so acting takes seconds, not hours.

**One-liner (slide or social):** Busy mind? Dump it to Pem. It researches, surfaces options, and drafts messages while you live your life. Come back to preps ready to act on. The task is yours — the thinking doesn’t have to be.

### How it works (three steps)

1. **You dump** — Text, anywhere. No structure required. Pem catches everything, half-formed thoughts included.
2. **Pem preps** — Pem classifies, routes work to agents in parallel, and delivers results as they’re ready. No babysitting.
3. **You act. Mark done.** — Come back when you want. Tap through options, read summaries, review drafts. Mark complete. Brain empty.

### What Pem prepares (MVP)

Every dump is classified into one or more prep types (the list may grow; MVP focuses on these four):

| Type | What it does | Example |
|------|----------------|--------|
| **Web search** | Quick answers, current info, prices, reviews | “Is this Denver neighborhood safe for families?” |
| **Deep research** | Multiple sources → one clear answer | “Should I take this job offer? Here’s what I know…” |
| **Find options** | Real picks with links, prices, context; you choose | “Gift for mom — gardening, budget $60.” |
| **Draft it** | Email or text drafted for your review; you send | “Write my landlord about the leak.” |

**Principle:** Pem prepares; **you** execute. No autonomous sends, purchases, or decisions on your behalf.

### Mobile app navigation (direction)

Expo Router groups can separate **concerns** without requiring **tabs**:

| Area | Role | Typical navigator |
|------|------|-------------------|
| **Public** | Marketing / onboarding slider, product story, links into auth | **Stack** (`(public)/`) — no session required |
| **Auth** | OAuth on `/welcome` (Google, Apple) — no separate auth routes | Clerk `useSSO` |
| **App (signed-in)** | **`/home`** = preps hub; **Stack** pushes **dump**, **prepping**, **settings** | **Stack** (`(app)/`) |

**Stack vs tabs for Pem:** Signed-in users land on **`/home`**. **Dump** (dock) → **`/dump`** → **`/prepping`** (acknowledgement + in-flight prep rows + **View in Preps**) → **`/home`**. **Settings** (fixed in **`HomeTopBar`**) on the same stack.

**Splash and fonts** stay in the **root** `_layout.tsx` once (global cold start). **ClerkProvider** wraps routes that need auth; use **signed-in vs signed-out** redirects to send users to `(public)` vs `(app)` without duplicating splash inside each group. On **wide viewports** (tablet, web), the root layout **caps content width** (`MAX_APP_CONTENT_WIDTH` in `app/constants/layout.ts`) and centers it so chrome and screens stay phone-sized.

---

## `app/` — mobile client

- **Expo** (React Native), **expo-router** (file-based routes under `app/app/`)
- **TypeScript** (strict), **React 19**, **New Architecture** + **React Compiler** (see `app/app.json`)
- UI primitives: `app/components/ui/` (`PemText`, `PemButton`, `PemTextField`); layout shells: `app/components/layout/` (`PemScreen`, `ScreenScroll`, …). **Page sections** (one-off chunks to keep route files short): `app/components/sections/<page>-sections/` (e.g. `home-sections/`, `dump-sections/`). Tokens: `app/constants/theme.ts` and `typography.ts`
- **Icons:** `lucide-react-native` (stroke-based icons; requires **`react-native-svg`**, installed alongside)
- **Gradients:** `expo-linear-gradient` (e.g. full-screen capture on **`/dump`**)
- **Blur / glass:** `expo-blur` (`BlurView`) — use when you want frosted chrome; **`/home`** uses a solid **`HomeTopBar`** + dock
- **Haptics:** `expo-haptics` — soft impact / selection via `app/lib/pemHaptics.ts` (send, dump, open prep; not motor “buzz”; no-op on web)
- **Location:** `expo-location` — foreground location only when a prep needs it (e.g. **FIND_PLACE**); explainer sheet → system dialog → ephemeral hint to the API (**not** stored on `preps`). See `.cursor/rules/pem-location-permission.mdc`.
- **Push:** `expo-notifications` + `expo-device` — after sign-in, **`PushNotificationRegistrar`** requests permission, registers the Expo token with **`PATCH /users/me/push-token`**, and opens **`/prep/[id]`** when the user taps a **prep ready** notification (`prep_id` in payload). Physical device only; **production** iOS needs push capability / APNs via EAS credentials (see Expo push setup). `expo-notifications` is listed in `app.json` plugins.
- **Theme:** `contexts/ThemeContext.tsx` — **light / dark / system**, persisted with **`@react-native-async-storage/async-storage`**. `useTheme()` supplies semantic colors (see `ThemeSemantic`); root `StatusBar` follows resolved scheme.
- **Clerk** (`EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` in `app/.env`) — root layout: splash + fonts, then `ClerkProvider` + `<Slot />`. Sign-in is **OAuth only** on `/welcome` (**Google** + **Apple**) via `useSSO` from `@clerk/expo` with **`expo-auth-session`** + **`expo-web-browser`**. In the [Clerk dashboard](https://dashboard.clerk.com), enable **Google** and **Apple** SSO providers and add the redirect URL your app uses (see Clerk’s Expo / OAuth docs).
- **API** — set **`EXPO_PUBLIC_API_URL`** to the NestJS base URL (no trailing slash), e.g. `http://127.0.0.1:8000` with the backend running locally. In development, if this points at loopback but Metro is on a **LAN IP** (physical device), the app resolves the API to **`http://<metro-host>:8000`** automatically. Physical devices otherwise need your machine’s LAN IP or a deployed API URL. The hub and dump flow use **`POST /dumps`** (transcript max **16k** characters; queues split + prep jobs; returns `{ status, dumpId }`), **`GET /preps`** (optional **`?limit=`** / **`cursor=`** / **`status=`**; **`status=ready`** = Inbox; **`status=done`** = ready preps marked done; **`dumpId=`** scopes one dump; **`status=prepping`** includes failed), **`GET /preps/counts`** (includes **`done`** alongside **`ready`** / **`preparing`** / **`archived`** / **`starred`**), **`GET /preps/stream?dumpId=`** (SSE for live prep updates; nested `prep` objects include **`intent`** when present), **`GET /preps/:id`** (includes **`dump_transcript`** for the parent dump; **`prep_type: composite`** marks intelligent briefs — **`result.schema`** **`COMPOSITE_BRIEF`**); prep JSON includes **`done_at`** when set), **`GET /preps/:id/steps`**, **`POST /preps/:id/client-hints`** (ephemeral device location or **`locationUnavailable`** for one prep run — Redis only), **`PATCH /preps/:id/done`** (body **`{ done: boolean }`** — Inbox vs Done), **`PATCH /preps/:id/archive`**, **`DELETE /preps/:id`** (permanent delete), **`POST /preps/:id/retry`** (failed preps only), **`GET/POST /users/me/profile`** (optional **`?limit=`** / **`cursor=`** / **`status=active|historical|all`** on GET), **`PATCH/DELETE /users/me/profile/:id`** — **memory facts** (`memory_key`, `note`, `learned_at`, `status`, optional source ids). **`PATCH /preps/:id/opened`** marks a ready prep as read (`opened_at`). Same Clerk session token as other routes. Preps are cached in **`AsyncStorage`** for instant hub load, then refreshed; **What Pem knows** uses **`profileFacts:v3:${userId}:${tab}`** per Active/Historical tab. Apply DB migration **`backend/drizzle/0004_memory_facts_opened_at.sql`** (replaces **`user_profile`** with **`memory_facts`**, adds **`preps.opened_at`**).

**Routes (file-based under `app/app/`):**

| Path | Group | Notes |
|------|--------|--------|
| `/` | `index.tsx` | Redirects to `/home` if signed in, else `/welcome` |
| `/welcome` | `(public)/welcome.tsx` | Centered marketing + **Continue with Google** / **Continue with Apple** |
| `/home` | `(app)/home.tsx` | **Preps hub:** header + drawer (**Inbox** / **In progress** / **Archived** / **Starred** / **Done**); **Dump** FAB → **`/dump`**; prep rows → **`/prep/[id]`** |
| `/prep/[id]` | `(app)/prep/[id].tsx` | Full prep: options, research, or draft — **Done** / **Move to Inbox** on ready preps; archived preps can **Restore**; archive/delete stay on list swipe |
| `/dump` | `(app)/dump.tsx` | Full-bleed gradient; headline + example + **multiline text field** + **Send** → **`/prepping`**; **Close** → **`/home`** |
| `/prepping` | `(app)/prepping.tsx` | After a dump: **Pem’s got it** + **In flight** rows (same demo as hub) + reassurance (scrolls); **View in Preps** pinned at bottom — **`/home`** |
| `/settings` | `(app)/settings/index.tsx` | Profile (Clerk), **Pem memory** → **`/settings/profile`**, appearance, sign out; **Close** (`X`) runs **`router.back()`** or **`/home`** if there is no stack history |
| `/settings/profile` | `(app)/settings/profile.tsx` | What Pem knows: paginated list (scroll for more), cached first page for fast return, add, edit, delete profile facts (API above); pull to refresh |

**Develop**

```bash
cd app
npm install
npm start
```

Lint: `npm run lint`. Unit tests (prep result → UI body mapping): `npm test`. **Home** hub lists and **Prepping** (post-dump) support **pull-to-refresh**; prep lists are **newest first** (`created_at` / `id` descending) end-to-end. See **`app/README.md`** for app-local commands.

## `backend/` — HTTP API (NestJS + Drizzle)

- **Node**, **NestJS**, **Drizzle ORM** (PostgreSQL via `pg`), **Clerk** (JWT via **jose** + JWKS, webhooks via **Svix**), **`@nestjs/throttler`**, **OpenAPI** (**Swagger UI** at `/docs` when **`ENV` ≠ `prod`**)

**Develop**

```bash
cd backend
npm install
npm run start:dev
```

Configure **`.env`** in `backend/` (see `backend/.env.example`). Required: **`DATABASE_URL`** (or **`DATABASE_URL_SYNC`**), **`REDIS_URL`** (BullMQ + SSE pub/sub), **`OPENAI_API_KEY`**, and for Clerk-backed routes and webhooks **`CLERK_JWKS_URL`**, **`CLERK_JWT_ISSUER`**, **`CLERK_WEBHOOK_SECRET`**. Use **`TAVILY_API_KEY`** for web search in prep agents and **`SERP_API_KEY`** for SerpAPI (Google Shopping, Maps, organic) where structured product or place data is needed. Optional: **`PORT`** (default `8000`), **`ALLOWED_ORIGINS`** (comma-separated), **`ENV`**, **`OPENAI_MODEL`** (split/summary; default `gpt-4o-mini`), **`OPENAI_AGENT_MODEL`** (tool-loop prep agent; default `gpt-4o`), **`AGENT_MAX_STEPS`**, **`COMPOSITE_AGENT_MAX_STEPS`** (composite briefs; default **14**), **`COMPOSITE_DETECT_TIMEOUT_MS`** (gpt-4o-mini composite-vs-single detection; default **25000**), **`COMPOSITE_FANOUT_ENABLED`** (default on; set **`false`** for a single composite agent loop), **`COMPOSITE_FANOUT_MAX_LANES`**, **`COMPOSITE_FANOUT_MAX_STEPS_PER_LANE`**, **`COMPOSITE_FANOUT_PLAN_TIMEOUT_MS`**, **`COMPOSITE_MERGE_ENABLED`** (default on; **`false`** skips the post-lane merge LLM), **`COMPOSITE_MERGE_TIMEOUT_MS`** (default **120000**). Apply migration **`backend/drizzle/0013_preps_is_composite.sql`** for **`preps.is_composite`**.

**Clerk users in Postgres:** The API **creates a `users` row on first authenticated request** from claims in the session JWT (`sub`, and `email` / `name` when present). The Clerk webhook still syncs updates; you can also add **`email`** / **`name`** to your session token template in Clerk for richer first inserts.

Database migrations: **Drizzle Kit** — see **`backend/README.md`** (`db:generate`, `db:migrate`).

## Documentation and Cursor rules

**This `README.md`** is the **source of truth** for project documentation that humans read first (stack, layout, how to run things, env expectations). When you change stacks, setup, or contributor workflow, **update this file in the same change**—do not rely only on code or AI rules.

Cursor rules in **`.cursor/rules/`** capture the same facts for agents, plus coding conventions:

| File | Scope |
|------|--------|
| `pem-project.mdc` | Monorepo layout, stacks, README + rules maintenance, collaboration norms |
| `pem-app.mdc` | Expo / React Native / UI patterns |
| `pem-backend.mdc` | NestJS backend (`backend/`) — Drizzle, Clerk, modules |
| `pem-intake-routing.mdc` | Split vs intent, per-thought routing and Tavily/output UX rules |
| `pem-adaptive-prep-cards.mdc` | Adaptive card schemas (`result.schema`), 5-stage prep pipeline target, detail UI dispatch |

When you add **packages**, **dependencies**, or **new patterns**, update **both** this README (if contributors need to know) **and** the relevant `.mdc` files so documentation and tooling stay aligned.

**Working with AI:** Share a **plan before substantial coding** (goal, scope, files) and align with your teammate **before** large edits—**code together**, with you steering.
