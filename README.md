# Pem

Monorepo for the Pem product: a mobile client and HTTP API. The **`mobile-app/`** and **`api/`** trees are separate packages (no shared runtime code between them).

**Brand & color reference:** see **`brand/pem-brand.html`** (open in a browser) and **`brand/README.md`**. The mobile app maps these to `mobile-app/constants/theme.ts` and `mobile-app/constants/typography.ts`; when in doubt about palette, type, or voice, check the brand kit first.

## What is Pem?

**Pem clears a busy mind** — not a chatbot to babysit, not a prep engine. You **dump** messy thoughts (voice or text). Pem **extracts** what matters into **actionable items** (inbox, dates, tone). You read what Pem figured out, tap for detail, mark **done** or **not relevant**. Relief comes from **offloading the carrying**, not from Pem pretending to run your errands or send email for you.

**One-liner:** Dump what’s in your head; Pem organizes it into your inbox and journal so you can come back when you’re ready.

### How it works (three steps)

1. **You dump** — Text or voice, anytime. No structure required.
2. **Pem extracts** — Classification, tone, timing hints, batches; items land in the **inbox** (and raw input stays in **dumps / thoughts**).
3. **You engage on your terms** — Brief, inbox, chat (Ask Pem), calendar when connected. **You** always perform real-world actions.

**Principle:** Pem **organizes**; **you** execute. No autonomous sends, purchases, or decisions on your behalf.

### Mobile app navigation (direction)

Expo Router uses a **drawer + stack**: **Brief** (daily view), **Dumps** (thoughts / journal from `dumps`), **Done**, **Settings**; **Chat** for conversational Ask + task-aware replies; inline bar for **Dump** vs **Ask** modes per product rules in **`pem-app.mdc`**.

**Splash and fonts** stay in the **root** `_layout.tsx` once (global cold start). **ClerkProvider** wraps routes that need auth; use **signed-in vs signed-out** redirects to send users to `(public)` vs `(app)` without duplicating splash inside each group. On **wide viewports** (tablet, web), the root layout **caps content width** (`MAX_APP_CONTENT_WIDTH` in `mobile-app/constants/layout.ts`) and centers it so chrome and screens stay phone-sized.

---

## `mobile-app/` — mobile client

- **Expo** (React Native), **expo-router** (file-based routes under `mobile-app/app/`)
- **TypeScript** (strict), **React 19**, **New Architecture** + **React Compiler** (see `mobile-app/app.json`)
- UI primitives: `mobile-app/components/ui/` (`PemText`, `PemButton`, `PemTextField`); layout shells: `mobile-app/components/layout/` (`PemScreen`, `ScreenScroll`, …). **Page sections** (one-off chunks to keep route files short): `mobile-app/components/sections/<page>-sections/` (e.g. `home-sections/`, `dump-sections/`). Tokens: `mobile-app/constants/theme.ts` and `typography.ts`
- **Icons:** `lucide-react-native` (stroke-based icons; requires **`react-native-svg`**, installed alongside)
- **Gradients:** `expo-linear-gradient` where full-bleed surfaces need it
- **Blur / glass:** `expo-blur` (`BlurView`) — frosted chrome where needed; main shells use theme tokens + **`HomeTopBar`** / drawer patterns per `pem-app.mdc`
- **Haptics:** `expo-haptics` — soft impact / selection via `mobile-app/lib/pemHaptics.ts` (no-op on web)
- **Push:** `expo-notifications` + `expo-device` — after sign-in, **`PushNotificationRegistrar`** registers the Expo token with **`PATCH /users/me/push-token`**; **`inbox_updated`** notifications deep-link to **`/inbox`**. Physical device only for real pushes; **`expo-notifications`** is listed in `mobile-app/app.json` plugins.
- **Theme:** `contexts/ThemeContext.tsx` — **light / dark / system**, persisted with **`@react-native-async-storage/async-storage`**. `useTheme()` supplies semantic colors (see `ThemeSemantic`); root `StatusBar` follows resolved scheme.
- **Clerk** (`EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` in `mobile-app/.env`) — root layout: splash + fonts, then `ClerkProvider` + `<Slot />`. Sign-in is **OAuth only** on `/welcome` (**Google** + **Apple**) via `useSSO` from `@clerk/expo` with **`expo-auth-session`** + **`expo-web-browser`**. In the [Clerk dashboard](https://dashboard.clerk.com), enable **Google** and **Apple** SSO providers and add the redirect URL your app uses (see Clerk’s Expo / OAuth docs).
- **API** — set **`EXPO_PUBLIC_API_URL`** to the NestJS base URL (no trailing slash), e.g. `http://127.0.0.1:8000`. On a physical device with Metro on a LAN IP, the app can resolve the API to **`http://<metro-host>:8000`**. Primary flows: **`POST /dumps`** / voice dump variants, **`GET /inbox`** / **`GET /inbox/brief`**, **`GET /extracts/*`**, **`POST /chat/messages`**, **`POST /ask`**, **`GET /chat/stream`** (SSE), **`PATCH /users/me/timezone`**, profile / memory facts under **`/users/me/profile`**. See **`pem-app.mdc`** and **`pem-backend.mdc`** for the canonical route list.

**Routes (file-based under `mobile-app/app/`):** Prefer **`pem-app.mdc`** for the current drawer + stack map (`/inbox`, thoughts/dumps, done, settings, chat, category pages). The table below is illustrative, not exhaustive.

| Path | Group | Notes |
|------|--------|--------|
| `/` | `index.tsx` | Redirects signed-in users to the app shell (e.g. brief/inbox), else `/welcome` |
| `/welcome` | `(public)/welcome.tsx` | OAuth (**Google** / **Apple**) via Clerk |
| `/inbox` | `(app)/` | Daily brief + actionable items |
| `/chat` | `(app)/` | Chat + Ask Pem (task-aware, SSE) |
| `/settings` | `(app)/settings/` | Profile, memory, appearance, calendar connection, sign out |

**Develop**

```bash
cd mobile-app
npm install
npm start
```

Lint: `npm run lint`. Unit tests: `npm test`. Lists that hit the API generally support **pull-to-refresh**. See **`mobile-app/README.md`** for app-local commands.

## `api/` — HTTP API (NestJS + Drizzle)

- **Node**, **NestJS**, **Drizzle ORM** (PostgreSQL via `pg`), **Clerk** (JWT via **jose** + JWKS, webhooks via **Svix**), **`@nestjs/throttler`**

**Develop**

```bash
cd api
npm install
npm run start:dev
```

Configure **`.env`** in `api/` (see `api/.env.example`). Required: **`DATABASE_URL`** (or **`DATABASE_URL_SYNC`**), **`REDIS_URL`** (BullMQ + SSE pub/sub), **`OPENAI_API_KEY`**, and for Clerk-backed routes and webhooks **`CLERK_JWKS_URL`**, **`CLERK_JWT_ISSUER`**, **`CLERK_WEBHOOK_SECRET`**. Optional: **`PORT`** (default `8000`), **`ALLOWED_ORIGINS`** (comma-separated), **`ENV`**, model overrides per `api/README.md` / config. Run **`npm run db:migrate`** after pulling schema changes.

**Clerk users in Postgres:** The API **creates a `users` row on first authenticated request** from claims in the session JWT (`sub`, and `email` / `name` when present). The Clerk webhook still syncs updates; you can also add **`email`** / **`name`** to your session token template in Clerk for richer first inserts.

Database migrations: **Drizzle Kit** — see **`api/README.md`** (`db:generate`, `db:migrate`).

## Documentation and Cursor rules

**This `README.md`** is the **source of truth** for project documentation that humans read first (stack, layout, how to run things, env expectations). When you change stacks, setup, or contributor workflow, **update this file in the same change**—do not rely only on code or AI rules.

Cursor rules in **`.cursor/rules/`** capture the same facts for agents, plus coding conventions:

| File | Scope |
|------|--------|
| `pem-project.mdc` | Monorepo layout, stacks, README + rules maintenance, collaboration norms |
| `pem-coding-standards.mdc` | Repo-wide standards — file line limits, naming, components/hooks, security & scalability PR checklist |
| `pem-app.mdc` | Expo / React Native / UI patterns |
| `pem-backend.mdc` | NestJS API (`api/`) — Drizzle, Clerk, modules |
| `pem-thought-organizer.mdc` | Product pivot: dumps → extracts/inbox, chat, no prep-era surfaces |

When you add **packages**, **dependencies**, or **new patterns**, update **both** this README (if contributors need to know) **and** the relevant `.mdc` files so documentation and tooling stay aligned.

**Working with AI:** Share a **plan before substantial coding** (goal, scope, files) and align with your teammate **before** large edits—**code together**, with you steering.
