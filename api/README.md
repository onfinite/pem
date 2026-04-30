# Pem API (NestJS + Drizzle)

HTTP API for Pem: **PostgreSQL** (users, messages, extracts, calendar, embeddings, etc.), **Clerk** auth and webhooks, **BullMQ** workers.

## Stack

- **NestJS** 11, **Drizzle ORM**, **pg**, **BullMQ** + Redis
- **Clerk:** `jose` (JWKS + RS256) for `Authorization: Bearer`, **Svix** for `POST /webhooks/clerk`
- **Rate limiting:** `@nestjs/throttler` (see `AppModule` for limits)

## Setup

```bash
cd api
npm install
cp .env.example .env   # fill DATABASE_URL + Clerk vars (see repo root README)
npm run start:dev
```

Default port **8000**.

## Source layout (`src/`)

- **`core/`** — Infra only: `config/`, `bootstrap/` (`configureApp`), `auth/` (Clerk guard + JWT helpers), `utils/` (shared helpers + generic URL/SSRF/extract utilities used by chat link pipeline).
- **`database/`** — Drizzle schemas and `DatabaseModule` (unchanged as the data layer).
- **`modules/`** — Feature modules. **Chat surface** is split by responsibility: **`chat/`** (controller + `chat.module` + DTOs + `chat.constants`), **`messages/`** (`ChatService` — message rows), **`memory/`** (`EmbeddingsService`), **`media/`** (voice, photo, links, signed URLs), **`agent/`** (Pem agent + Ask question path), **`messaging/`** (SSE, events, triage, orchestrator, `jobs/chat.processor`), **`briefs/`** (morning brief + weekly reflection). Also **`users/`**, **`calendar/`**, **`extracts/`**, **`lists/`**, **`push/`**, **`profile/`**, **`storage/`**, **`health/`**.
- **`app.module.ts`**, **`main.ts`** — Application entry.

Imports use the `@/` alias → `src/` (e.g. `@/modules/messaging/...`, `@/modules/media/...`, `@/core/config/...`, `@/database/...`).

## Routes

| Method | Path | Notes |
|--------|------|--------|
| GET | `/health` | `{ "status": "ok" }` |
| GET | `/users/me` | Bearer JWT (Clerk session) |
| POST | `/webhooks/clerk` | Svix-signed; **`UsersModule`** — `user.created` / `user.updated` / `user.deleted` |

## Database

Drizzle table definitions live in **`src/database/schemas/`** (one file per table; `index.ts` is the barrel). **Do not** hand-write SQL under `drizzle/` or edit `drizzle/meta/` — **Drizzle Kit** maintains that when you generate migrations.

Workflow:

1. Edit the schema (`.ts` files in `src/database/schemas/`).
2. **`npm run db:generate`** — produces the next migration SQL and updates `drizzle/meta/` (snapshots + journal). Review the generated `.sql`.
3. **`npm run db:migrate`** — applies pending migrations to Postgres (uses `DATABASE_URL` from `.env`). This **does not** generate files; only **`db:generate`** does.

One-off SQL (data fixes, exploratory `ALTER` in dev): run via Neon SQL editor or a **temporary** local script, then discard it — **don’t** commit random SQL into `drizzle/` unless it came from **`db:generate`**.

**Tracking:** Postgres table **`__drizzle_migrations`** records which migrations ran. `drizzle/meta/` is for **generate**’s diffing, not for **`migrate`** at runtime.

If the DB already has tables from an old migration history and a fresh baseline conflicts (**relation already exists**), use a **new empty database** or reconcile manually before migrating.

The **`pg` SSL warning** during migrate is from the driver; optional: set `sslmode=verify-full` on `DATABASE_URL`.

**Note:** `drizzle.config.ts` loads **`.env`** via `dotenv` so CLI commands pick up `DATABASE_URL`.

Dev shortcut without migration files: `npm run db:push` (schema push; not for production workflows).

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run start:dev` | Watch mode |
| `npm run build` | Compile to `dist/` |
| `npm run lint` | ESLint |
| `npm run test:e2e` | E2E (needs `DATABASE_URL`; see `test/setup-e2e.ts`) |

`nest-cli` uses `deleteOutDir: false` so `npm run start:dev` doesn’t delete all of `dist/` right before Node boots (which caused missing `dist/src/main.js`). If something feels stale after refactors, run `rm -rf dist && npm run build`. Production images should run a clean `nest build` (or delete `dist` first).
