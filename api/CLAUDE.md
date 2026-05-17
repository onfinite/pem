# api/CLAUDE.md

NestJS HTTP backend. See [`docs/architecture.md`](../docs/architecture.md) for full pipeline and schema details, [`docs/coding-standards.md`](../docs/coding-standards.md) for style rules.

## Commands

```bash
npm run start:dev         # NestJS watch mode (port 8000)
npm run build             # Compile to dist/
npm run lint              # ESLint
npm test                  # Jest unit tests
npm run test:e2e          # E2E tests (requires DATABASE_URL)
npm run check-standards   # Validate file line limits

# Database
npm run db:generate       # Diff schema → write next migration SQL (run after editing schemas/)
npm run db:migrate        # Apply pending migrations to Postgres
npm run db:push           # Push schema directly (dev only, not prod)
npm run db:studio         # Drizzle Studio UI
```

## Environment (`.env`, see `.env.example`)

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | yes | PostgreSQL |
| `REDIS_URL` | yes | BullMQ + SSE pub/sub |
| `OPENAI_API_KEY` | yes | Fails fast on startup if missing |
| `CLERK_JWKS_URL` | yes | |
| `CLERK_JWT_ISSUER` | yes | |
| `CLERK_WEBHOOK_SECRET` | yes | Svix webhook validation |
| `GOOGLE_OAUTH_STATE_SECRET` | yes | Calendar OAuth HMAC signing |
| `ALLOWED_ORIGINS` | yes | Comma-separated; bootstrap throws if missing |
| `PORT` | no | Default `8000` |

## Most-touched paths

```
core/auth/          ← ClerkAuthGuard, @GetUser() — touched on every new endpoint
database/schemas/   ← Drizzle table definitions — only source of truth for schema
modules/messaging/  ← SSE, triage, ChatOrchestratorService, BullMQ jobs — chat pipeline lives here
modules/agent/      ← PemAgentService, prompt chaining, question/ (Ask path)
```

Full module layout: [`docs/architecture.md`](../docs/architecture.md#module-layout-src).

## Drizzle workflow

Edit `src/database/schemas/` (TypeScript) → `npm run db:generate` → review SQL → `npm run db:migrate`.
**Never** hand-edit `drizzle/*.sql` or `drizzle/meta/`.

## Security rules

- Every endpoint behind `ClerkAuthGuard` unless explicitly `@Public()`
- `userId` always from JWT via `@GetUser()` — never from request body
- Every DB query returning user data **must** filter by `authenticatedUserId`
- DTOs validate all inputs with `class-validator`; always `@MaxLength` on strings
- Never log request bodies, tokens, or user content — log `messageId`/`userId` only
- Rate limiting: global `ThrottlerGuard` as `APP_GUARD`; no `@SkipThrottle` without reason
- CORS: `ALLOWED_ORIGINS` explicit allowlist — bootstrap throws if missing
- File uploads: validate MIME type and size; never trust `Content-Type` header

## File size

Run `npm run check-standards` after any file edit. If a file hits its line limit, split it before continuing — never ask the user whether to proceed.

## Key conventions

- Controllers are thin — route and delegate only, no business logic
- `@/` alias maps to `src/` (Nest rewrites to relative paths in `dist/`)
- AI prompts isolated in `.system-prompt.ts` files or as private builders on `@Injectable()` services
- `gpt-4o-mini` (~300ms) may be in the request path; `gpt-4o` (3–30s) must go through BullMQ
- Use `generateText` + `Output.object({ schema })` with Zod — never `generateObject`/`streamObject`
