# mobile-app/CLAUDE.md

Expo (React Native) client. See [`docs/architecture.md`](../docs/architecture.md) for full app structure and product model, [`docs/coding-standards.md`](../docs/coding-standards.md) for style rules.

## File size

Run `npm run check-standards` after any file edit. If a file hits its line limit, split it before continuing — never ask the user whether to proceed.

## Commands

```bash
npm start                 # Expo dev server
npm run ios               # iOS simulator
npm run android           # Android emulator
npm run lint              # Expo linter
npm test                  # Vitest unit tests
npm run check-standards   # Validate file line limits
```

## Environment (`.env`)

| Variable | Notes |
|----------|-------|
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk OAuth |
| `EXPO_PUBLIC_API_URL` | NestJS base URL, no trailing slash (e.g. `http://127.0.0.1:8000`) |

## Routing (`app/` — expo-router)

```
index.tsx                 ← redirects signed-in → app shell, else /welcome
(public)/
  welcome.tsx             ← OAuth only (Google + Apple) via Clerk useSSO
(app)/
  _layout.tsx             ← Stack + AppDrawerProvider
  inbox.tsx               ← Daily Brief (default home)
  chat.tsx                ← Chat + Ask Pem (SSE streaming)
  thoughts/_layout.tsx    ← inner Stack: list → detail (raw dumps)
  done.tsx
  settings/
  category/[slug].tsx     ← batch/category pages
```

**Auth:** Clerk OAuth only (`@clerk/expo` + `expo-auth-session` + `expo-web-browser`). `ClerkProvider` wraps the root layout.

## Most-touched paths

| Path | Purpose |
|------|---------|
| `components/ui/` | `PemText`, `PemButton`, `PemTextField` — use these, never raw RN primitives |
| `constants/theme.ts` | All color tokens, spacing, radius — never hardcode values |
| `constants/typography.ts` | Font sizes, weights, line heights |
| `services/api/pemApi.ts` | HTTP client — all API calls go here |

Full folder structure: [`docs/architecture.md`](../docs/architecture.md#feature-folders).

## Key components

- **InlineVoiceBar** — Dump mode → `POST /dumps` / `POST /dumps/voice`; Ask mode → `POST /ask` / `POST /ask/voice`. Toggle via **? ask** / **× dump** beside the field. Callbacks: `onDumpSuccess`, `onDumpCreated`, `onPemResponse`.
- **PemResponseSheet** — Slide-up answer sheet, appears from `onPemResponse` in Ask mode.
- **TaskDrawer** (`components/inbox/TaskDrawer.tsx`) — re-exports from `components/drawer/`.
- **PushNotificationRegistrar** — registers Expo push token via `PATCH /users/me/push-token`.
- **TimezoneRegistrar** — `PATCH /users/me/timezone` after auth.

## Key conventions

- `@/` alias maps to the `mobile-app/` project root (configured in `tsconfig.json`, `babel.config.js`, `metro.config.js`, `vitest.config.ts`)
- Colors, spacing, radius, fonts from `constants/theme.ts` and `constants/typography.ts` only
- `StyleSheet.create` always at bottom of file; no inline styles for static values
- One component per file; named exports only (no default exports)
- Props interface defined in same file, above component
- Wide viewports: root layout caps content at `MAX_APP_CONTENT_WIDTH` and centers it
