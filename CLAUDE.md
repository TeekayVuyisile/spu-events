# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

A full rebuild is in progress on the `redesign` branch. `docs/REDESIGN_PLAN.md` holds the product workflows, data model and delivery phases. Phases 0 (foundations), 1 (auth and roles) and 2 (events) are done. The old Express/EJS app lives in `legacy/` as a **reference for features only**. Don't extend it. It will be deleted once the new app reaches feature parity.

## Commands (run from repo root)

- `npm install`: installs every workspace (Node ≥ 22.12; see `.nvmrc`)
- `npm run dev`: API on :4000 and web on :5173. Vite proxies `/api` to the API, so the browser stays same-origin.
- `npm test`: Vitest in every workspace. API tests are integration tests against a real Postgres database in `TEST_DATABASE_URL` (its name must contain "test"; the suite migrates it and truncates tables before each test). CI runs a Postgres service for them. To run one file: `npx vitest run apps/api/test/health.test.ts`. To filter by name: `npx vitest run -t "health"`.
- `npm run lint` · `npm run typecheck` · `npm run format` · `npm run build`. CI (`.github/workflows/ci.yml`) runs format:check, lint, typecheck, test and build.
- Database: change `apps/api/src/db/schema/*`, run `npm run db:generate -- --name <change>`, then run `npm run db:migrate`. Never hand-edit an applied migration in `apps/api/drizzle/`.
- First admin: `npm run user:create-admin -- --email <email> --first-name <name> --last-name <name>` (prompts for the password, or reads `ADMIN_PASSWORD`). Every other staff or admin account comes from an invite.
- Config: `apps/api/.env` (copy `.env.example`; URL-encode special characters in the password). The legacy app reads `legacy/.env`.

## Architecture

npm workspaces:

- `packages/shared`: Zod schemas plus inferred types shared by the API and the web app (roles, the `ApiError` shape, money helpers). It ships as TS source, with no build step. The API's `tsup` bundles it, and Vite compiles it directly.
- `apps/api`: Express 5 + TypeScript + Drizzle (node-postgres).
  - `app.ts` `createApp(deps)` builds the app without listening. Dependencies are injected (env, logger, db functions), so tests use supertest with fakes. `server.ts` is the only place that wires real resources.
  - `config/env.ts` validates `process.env` with Zod at startup. Read config only from there.
  - Feature code goes in `src/modules/<feature>/` and follows the layers **routes → controller → service → repository (Drizzle)**. Keep business rules in services.
  - Errors: services throw `AppError` (`lib/errors.ts`). `middleware/error-handler.ts` turns them into `{ error: { code, message, fields? } }` (`ApiError` in shared). Validate input with `validate(part, schema)` using shared Zod schemas. The parsed values land in `res.locals.valid`.
  - Drizzle uses `casing: 'snake_case'`: camelCase in TS, snake_case in SQL.
  - Repositories take an `Executor` (db or transaction), so services compose atomic writes with `db.transaction((tx) => repo(tx)…)`.
  - Auth: httpOnly cookie sessions (`express-session` + `connect-pg-simple`, table `sessions` owned by our migrations), argon2id passwords. `attachUser` reloads the user on each request into `res.locals.user`, so suspensions apply immediately. Guard routes with `requireAuth` / `requireRole(...)` from `middleware/auth.ts`. Call `startSession` on every login (it regenerates the session id).
  - Uploads: files go through `StorageService` (`lib/storage.ts`; local disk in `UPLOADS_DIR`, served at `/api/uploads`, in-memory in tests). Never trust the file name or Content-Type: `detectImage` checks the bytes. The DB stores the storage key, and the API returns a URL.
  - Status changes use conditional updates (`transition(id, from, values)` in the events repository) so concurrent clicks can't both apply.
  - CSRF: `requireSameOrigin` rejects non-GET requests whose `Origin` isn't `WEB_ORIGIN`. In tests, use the `browser()` helper in `test/helpers.ts`, which sets it.
- `apps/web`: React 19 + Vite + Tailwind v4 + shadcn-style components (`components.json`) + Motion (`motion/react`) + TanStack Query + React Router 7 (data router in `src/router.tsx`).
  - Session state: `useSession()` in `lib/auth.ts`. Protect routes with the `requireUser(roles?)` loader, not in components. Forms use react-hook-form + the shared Zod schema; `applyServerError(form, err)` maps API field errors onto inputs.
  - Make every API call through `lib/api.ts` `api<T>()`. It sends cookies, parses JSON and throws `ApiRequestError` carrying the server's error shape.
  - `@/` is an alias for `apps/web/src`.
  - Admin, gate and auth routes are code-split with the `page(() => import(...), 'Name')` helper in `router.tsx`; keep new admin pages lazy so students don't download them.
  - Filters that change what a page shows (Discover, admin lists) live in the URL search params, parsed with the shared Zod query schema.

## Domain rules that span files

- Money is always **integer cents** (ZAR) in the DB, the API and shared types. Convert only for display (`formatCents`).
- There are three roles: `student`, `staff` (gate scanning), `admin`. Privileged accounts are created only through admin invite, never through public sign-up.
- Ticket check-in and wallet changes must be atomic (a single conditional `UPDATE … RETURNING` or a transaction). The wallet balance is derived from a ledger, never stored as a float.

## Design system

The rules live in `design-system/MASTER.md`. Page overrides are in `design-system/pages/*.md`, and these override MASTER. `design-system/preview.html` is a static visual reference.

- **Light theme is the default** (the user's preference). Dark is toggled through the `.dark` class. The gate scanner is always dark.
- Tokens are defined in `apps/web/src/styles/globals.css`. Use semantic classes (`bg-primary`, `bg-cta`, `text-muted-foreground`), never raw colours. Orange `cta` is for **one** primary action per view.
- Motion: use the tokens and variants from `src/lib/motion.ts`. `MotionConfig reducedMotion="user"` wraps the app. Animate transform and opacity only, with at most one or two signature animations per view.
- Ticket motif: the `ticket-notch` (set `[--notch-y:…]`), `perforation` and `tabular` (monospace numbers) utilities.
- Icons are Lucide only, and no emoji as icons. Touch targets are at least 44px.
