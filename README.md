# Pem

Monorepo for the Pem product: a mobile client and a backend API. The **`app/`** and **`api/`** trees are separate packages (no shared runtime code between them).

**Brand & color reference:** see **`brand/pem-brand.html`** (open in a browser) and **`brand/README.md`**. The mobile app maps these to `app/constants/theme.ts` and `app/constants/typography.ts`; when in doubt about palette, type, or voice, check the brand kit first.

## What is Pem?

**Pem is your prep work** — not a chatbot you prompt, not a task manager you maintain, not another AI tool that waits for you to show up.

You have a busy mind. Thoughts pile up: the birthday you forgot, the email you’ve been dreading, the idea from the shower, the thing you’ve meant to look into for three weeks. You often can’t act *right now* — no time, energy, or full information — but you can’t let it go either. That unresolved loop is the gap Pem lives in.

**Dump it** — voice or text, anytime (driving, in bed, between meetings). No structure, no prompting. Pem catches it all.

**Pem preps** — it classifies each dump, figures out what work is needed, and fans out to parallel agents (web search, deep research, options with links and prices, drafts you can send). You don’t babysit.

**You act** — come back when you’re ready. Your **preps** are waiting: summarized research, gift options, drafts to review. Mark done. The task is always **yours**; Pem doesn’t send, buy, call, or decide. It does the **thinking in the middle** so acting takes seconds, not hours.

**One-liner (slide or social):** Busy mind? Dump it to Pem. It researches, surfaces options, and drafts messages while you live your life. Come back to preps ready to act on. The task is yours — the thinking doesn’t have to be.

### How it works (three steps)

1. **You dump** — Voice or text, anywhere. No structure required. Pem listens and catches everything, half-formed thoughts included.
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
| **App (signed-in)** | **`/home`** = preps hub; **Stack** pushes **dump**, **preping**, **received**, **settings** | **Stack** (`(app)/`) |

**Stack vs tabs for Pem:** Signed-in users land on **`/home`**. **Pem mark** or **Record** control → **`/dump`** → **`/preping`** → **`/received`** → **`/home`**. **Settings** on the same stack.

**Splash and fonts** stay in the **root** `_layout.tsx` once (global cold start). **ClerkProvider** wraps routes that need auth; use **signed-in vs signed-out** redirects to send users to `(public)` vs `(app)` without duplicating splash inside each group.

---

## `app/` — mobile client

- **Expo** (React Native), **expo-router** (file-based routes under `app/app/`)
- **TypeScript** (strict), **React 19**, **New Architecture** + **React Compiler** (see `app/app.json`)
- UI primitives: `app/components/ui/` (`PemText`, `PemButton`, `PemTextField`); layout shells: `app/components/layout/` (`PemScreen`, `ScreenScroll`, …). **Page sections** (one-off chunks to keep route files short): `app/components/sections/<page>-sections/` (e.g. `home-sections/`, `dump-sections/`). Tokens: `app/constants/theme.ts` and `typography.ts`
- **Icons:** `lucide-react-native` (stroke-based icons; requires **`react-native-svg`**, installed alongside)
- **Gradients:** `expo-linear-gradient` (e.g. full-screen capture on **`/dump`**)
- **Blur / glass:** `expo-blur` (`BlurView` — frosted header + tab dock on **`/home`**)
- **Theme:** `contexts/ThemeContext.tsx` — **light / dark / system**, persisted with **`@react-native-async-storage/async-storage`**. `useTheme()` supplies semantic colors (see `ThemeSemantic`); root `StatusBar` follows resolved scheme.
- **Clerk** (`EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` in `app/.env`) — root layout: splash + fonts, then `ClerkProvider` + `<Slot />`. Sign-in is **OAuth only** on `/welcome` (**Google** + **Apple**) via `useSSO` from `@clerk/expo` with **`expo-auth-session`** + **`expo-web-browser`**. In the [Clerk dashboard](https://dashboard.clerk.com), enable **Google** and **Apple** SSO providers and add the redirect URL your app uses (see Clerk’s Expo / OAuth docs).

**Routes (file-based under `app/app/`):**

| Path | Group | Notes |
|------|--------|--------|
| `/` | `index.tsx` | Redirects to `/home` if signed in, else `/welcome` |
| `/welcome` | `(public)/welcome.tsx` | Centered marketing + **Continue with Google** / **Continue with Apple** |
| `/home` | `(app)/home.tsx` | **Preps hub:** glass **BlurView** header + floating glass tab dock; tabs **Ready** / **Preping** / **Archived**; **Pem mark** + **Record** (in dock) → **`/dump`**; prep cards → **`/prep/[id]`** (detail) |
| `/prep/[id]` | `(app)/prep/[id].tsx` | Full prep: options, research, or draft + **Copy** where relevant; **Close** → back |
| `/dump` | `(app)/dump.tsx` | Full-bleed gradient; **Try saying** + website-style example; bottom bar **keyboard** swaps to **text field + mic** (back to voice) + **Send**; **Done** / **Send** → **`/preping`**; **Close** → **`/home`** |
| `/preping` | `(app)/preping.tsx` | Parallel work in progress; **Continue** → **`/received`**; **back** → **`/home`** |
| `/received` | `(app)/received.tsx` | Short acknowledgement; **Close** / **Back to Preps** → **`/home`** |
| `/settings` | `(app)/settings.tsx` | Profile (Clerk), appearance (light / dark / system), sign out; **Close** (`X`) runs **`router.back()`** or **`/home`** if there is no stack history |

**Develop**

```bash
cd app
npm install
npm start
```

Lint: `npm run lint`. More Expo notes live in `app/README.md`.

## `api/` — HTTP API

- **Python** ≥ 3.13, **FastAPI**, **SQLModel**, **Alembic** (PostgreSQL)
- **Redis**, **arq** (async jobs), **structlog**, **slowapi** (rate limits), **Sentry**

**Develop**

```bash
cd api
uv sync
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Configure a **`.env`** in `api/` (fields are defined in `api/app/core/config.py`). At minimum you will need values for `database_url`, `database_url_sync`, `redis_url`, `openai_api_key`, and `sentry_sdk_dsn` (plus any others required by settings).

Database migrations: **Alembic** under `api/migrations/`.

## Documentation and Cursor rules

**This `README.md`** is the **source of truth** for project documentation that humans read first (what lives where, how to run things, stack summary, env expectations). When you change stacks, setup, or contributor workflow, **update this file in the same change**—do not rely only on code or AI rules.

Cursor rules in **`.cursor/rules/`** capture the same facts for agents, plus coding conventions:

| File | Scope |
|------|--------|
| `pem-project.mdc` | Monorepo layout, stacks, README + rules maintenance, collaboration norms |
| `pem-app.mdc` | Expo / React Native / UI patterns |
| `pem-api.mdc` | FastAPI / DB / routers / middleware |

When you add **packages**, **dependencies**, or **new patterns**, update **both** this README (if contributors need to know) **and** the relevant `.mdc` files so documentation and tooling stay aligned.

**Working with AI:** Share a **plan before substantial coding** (goal, scope, files) and align with your teammate **before** large edits—**code together**, with you steering.
