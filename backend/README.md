# Pem backend (NestJS + Drizzle)

HTTP API for Pem: **PostgreSQL** (`user`, `dump`, `prep`), **Clerk** auth and webhooks, **OpenAPI** in non-prod.

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
