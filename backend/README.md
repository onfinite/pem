# Pem backend (NestJS + Drizzle)

HTTP API for Pem: **PostgreSQL** (`users`, `dumps`, `actionables`, `memory_facts`), **Clerk** auth and webhooks, **OpenAPI** in non-prod.

## Stack

- **NestJS** 11, **Drizzle ORM**, **pg**

**Prep runner (high level):** Vague travel / situational asks default to **composite** (`COMPOSITE_BRIEF`) via heuristics + composite detection; **narrow** Serp flight pipe or explicit fare-only messages can stay **single-lane**. **Composite fan-out (default):** a mini-model **plans 2–4 parallel lanes** (e.g. flights vs hotels vs map); each lane runs a **separate** `generateText` tool loop in parallel; lane outputs are **concatenated**, then a **merge** pass (mini-model, **no tools**) dedupes and unifies into one memo, then the composite JSON formatter runs (thinness / adaptive fallbacks as before). Disable fan-out with `COMPOSITE_FANOUT_ENABLED=false`, or disable merge only with `COMPOSITE_MERGE_ENABLED=false`. The composite **normalizer** (`normalizeCompositeBrief`) repairs common mini-model mistakes; the formatter is retried once on failure.
- **Clerk:** `jose` (JWKS + RS256) for `Authorization: Bearer`, **Svix** for `POST /webhooks/clerk`
- **Rate limiting:** `@nestjs/throttler` (100/min; webhook route is skipped)

## Setup

```bash
cd backend
npm install
cp .env.example .env   # fill DATABASE_URL + Clerk vars (see repo root README)
npm run start:dev
```

Default port **8000**.

## Routes

| Method | Path | Notes |
|--------|------|--------|
| GET | `/health` | `{ "status": "ok" }` |
| GET | `/users/me` | Bearer JWT (Clerk session) |
| POST | `/webhooks/clerk` | Svix-signed body; `user.created` / `user.deleted` |

## Database

Drizzle table definitions live in `src/database/schemas/` (one file per table; `index.ts` is the barrel for Drizzle Kit and app imports).

For a **new** database or after changing `src/database/schemas/`:

```bash
npm run db:generate  # writes SQL under drizzle/ + meta snapshots
npm run db:migrate   # apply pending migrations (uses DATABASE_URL from .env)
```

The baseline migration is **`drizzle/0000_initial.sql`** (creates the four tables above). If an environment still has **legacy** tables from older Pem migrations, use a **fresh database** (or reconcile manually) before applying—there are no `DROP TABLE` shims in migrations anymore.

**How Drizzle tracks applies (common confusion):**

| Artifact | Role |
|----------|------|
| `drizzle/meta/*.json` + `_journal.json` | Used by **`db:generate`** to diff the schema and build the next migration. Not consulted by **`db:migrate`** against the server. |
| Table **`__drizzle_migrations`** in Postgres | Written by **`db:migrate`**. Lists which migration SQL files (by hash) already ran on *this* database. |

If you **replaced** the repo’s migration folder with a single new `0000_initial.sql` but the **same** Neon/Postgres still has old tables and/or old rows in `__drizzle_migrations`, `db:migrate` may try to apply the new baseline and fail with **relation "…" already exists**. Fix: **new database branch** (Neon) / drop dev tables and clear migration history, then run `db:migrate` again.

The **`pg` SSL warning** during migrate is from the driver (Neon URLs often use `sslmode=require`). You can set `sslmode=verify-full` on `DATABASE_URL` if you want to align with future `pg` defaults; it does not mean migrate failed.

**Note:** `drizzle.config.ts` loads **`.env`** via `dotenv` so CLI commands pick up `DATABASE_URL`.

Dev shortcut without migration files: `npm run db:push` (schema push; not for production workflows).

## OpenAPI (non-production)

When **`ENV` is not `prod`**:

| URL | UI |
|-----|-----|
| `/docs` | Swagger UI |
| `/docs-json` | OpenAPI JSON |

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run start:dev` | Watch mode |
| `npm run build` | Compile to `dist/` |
| `npm run lint` | ESLint |

`nest-cli` uses `deleteOutDir: false` so `npm run start:dev` doesn’t delete all of `dist/` right before Node boots (which caused missing `dist/src/main.js`). If something feels stale after refactors, run `rm -rf dist && npm run build`. Production images should run a clean `nest build` (or delete `dist` first).
| `npm run test:e2e` | E2E (needs `DATABASE_URL`; see `test/setup-e2e.ts`) |
