# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Pem?

**Pem clears a busy mind.** Users **dump** messy thoughts (voice or text). Pem **extracts** actionable items, classifies them by tone and timing, and sends them to the inbox. Users read what Pem figured out and mark done or dismiss. **Pem organizes; users execute.** No autonomous sends, purchases, or decisions on behalf of the user.

**Pre-production:** No live users, no data to preserve. Delete dead code without hesitation — no migration shims, no backwards compatibility, no feature flags wrapping old behavior.

## Repo structure

Two independent packages — no shared runtime code:

- `mobile-app/` — Expo (React Native) client → see [`mobile-app/CLAUDE.md`](mobile-app/CLAUDE.md)
- `api/` — NestJS HTTP backend → see [`api/CLAUDE.md`](api/CLAUDE.md)
- `brand/` — `pem-brand.html` (open in browser) — canonical palette, typography, voice
- `docs/` — Architecture and coding standards references

## Key docs

- [`docs/architecture.md`](docs/architecture.md) — chat pipeline, database schema, module layout, mobile structure, product model, API routes
- [`docs/coding-standards.md`](docs/coding-standards.md) — file limits, naming, components, hooks, security & scalability checklists

## Collaboration

Share a plan before substantial coding (goal, files, tradeoffs) and get explicit agreement before large edits. When in doubt, ask rather than implement.

**Docs with code:** When behavior, structure, or APIs change, update the relevant `CLAUDE.md` and `docs/` files in the same effort.
