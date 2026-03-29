# Pem

Monorepo for the Pem product: a mobile client and a backend API. The **`app/`** and **`api/`** trees are separate packages (no shared runtime code between them).

## `app/` — mobile client

- **Expo** (React Native), **expo-router** (file-based routes under `app/app/`)
- **TypeScript** (strict), **React 19**, **New Architecture** + **React Compiler** (see `app/app.json`)
- UI primitives (`PemScreen`, `PemText`, `PemButton`), tokens in `app/constants/theme.ts` and `app/constants/typography.ts`

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
