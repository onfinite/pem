# Pem backend (NestJS + Drizzle)

HTTP API for Pem: **PostgreSQL** (`user`, `dump`, `prep`), **Clerk** auth and webhooks, **OpenAPI** in non-prod.

## Stack

- **NestJS** 11, **Drizzle ORM**, **pg**
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
| `npm run test:e2e` | E2E (needs `DATABASE_URL`; see `test/setup-e2e.ts`) |
