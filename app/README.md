# Pem mobile app (`app/`)

Expo + React Native client. **Product story, stack, and env** are documented in the **repo root [`README.md`](../README.md)**.

## Commands (from `app/`)

```bash
npm install
npx expo start
npm run lint
npm test
```

Path alias **`@/`** → this package root (`tsconfig.json` / `babel.config.js`).

## Source layout (high level)

- **`app/`** — expo-router screens.
- **`components/chat/`** — thread UI by area: `bubbles/`, `input/`, `media/`, `links/`, `chrome/`, `calendar/`, `TaskPill.tsx`.
- **`components/drawer/`** — task drawer: `tabs/`, `inbox/`, `calendar/`, `edit/`, `task-item/`, `feedback/`, root `types` / `constants`. **`components/inbox/TaskDrawer.tsx`** re-exports the drawer view.
- **`services/`** — `api/`, `cache/`, `media/`, `push/`, `links/`.
- **`hooks/chat/`**, **`hooks/drawer/`**, **`hooks/shared/`**.
- **`utils/`** — `formatting/`, `text/`, `images/`, `guards/` (pure functions).
- **`lib/`** — remaining shared chat helpers/types (`buildChatDisplayItems`, `pemHaptics`, etc.).
