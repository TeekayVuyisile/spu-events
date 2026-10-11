# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

The app was rebuilt from an older Express/EJS version, which was removed in phase 8 (it's still in git history). `docs/REDESIGN_PLAN.md` holds the product workflows, data model and delivery phases. Phases 0 (foundations), 1 (auth and roles), 2 (events), 3 (wallet and tickets), 4 (gate), 5 (social), 6 (volunteers, moderation, notifications), 7 (admin dashboard, users, accessibility) and 8 (ship: demo seed, Render + Neon deployment, README) are done. The live site is https://spu-events.onrender.com; see `docs/DEPLOYMENT.md`. `main` is the deployed branch (Render auto-deploys it).

## Commands (run from repo root)

- `npm install`: installs every workspace (Node ≥ 22.12; see `.nvmrc`)
- `npm run dev`: API on :4000 and web on :5173. Vite proxies `/api` to the API, so the browser stays same-origin.
- `npm test`: Vitest in every workspace. API tests are integration tests against a real Postgres database in `TEST_DATABASE_URL` (its name must contain "test"; the suite migrates it and truncates tables before each test). CI runs a Postgres service for them. To run one file: `npx vitest run apps/api/test/health.test.ts`. To filter by name: `npx vitest run -t "health"`.
- `npm run lint` · `npm run typecheck` · `npm run format` · `npm run build`. CI (`.github/workflows/ci.yml`) runs format:check, lint, typecheck, test and build.
- Database: change `apps/api/src/db/schema/*`, run `npm run db:generate -- --name <change>`, then run `npm run db:migrate`. Never hand-edit an applied migration in `apps/api/drizzle/`.
- First admin: `npm run user:create-admin -- --email <email> --first-name <name> --last-name <name>` (prompts for the password, or reads `ADMIN_PASSWORD`). Every other staff or admin account comes from an invite.
- Demo data: `DEMO_PASSWORD=… npm run db:setup -w @spu-events/api` migrates, then seeds an **empty** database (`src/seed/demo.ts`). In production, `npm run release -w @spu-events/api` (`src/release.ts`) does the same before every start.
- Config: `apps/api/.env` (copy `.env.example`; URL-encode special characters in the password).
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
  - Money and capacity: debits lock the user row (`walletRepository.lockUser`) before reading the balance; ticket sales and releases lock the event row (`eventsRepository.lock`) first. Lock order is always event → ticket → user. Take the lock and read the data in **separate statements**: under READ COMMITTED, a `SELECT … FOR UPDATE` that waited still evaluates its subqueries with the pre-wait snapshot (that bug oversold events; `tickets.test.ts` guards it). Credits (refunds, top-ups) need no lock.
  - In Drizzle `sql` subqueries, reference outer columns as raw qualified SQL (`"events"."id"`): interpolated columns render unqualified in single-table selects (see `ticketsSoldSql`).
  - Payments go through `PaymentProvider` (`lib/payments.ts`, simulated for now); ticket QR codes are HMAC-signed with `TICKET_SIGNING_SECRET` (`lib/ticket-signing.ts`).
  - Gate: check-in is one conditional `UPDATE … WHERE status = 'valid'` (`gateRepository.checkIn`); every scan is logged in `scan_logs` and returns `200 { result }` (invalid tickets are answers, not errors). Live counters use Server-Sent Events fed by a `LiveBus` (`lib/live-bus.ts`, in-process: one API instance only until it's swapped for Postgres LISTEN/NOTIFY or Redis).
  - Social: public content shows authors as "First L." (`publicAuthor`), never full names or emails. Paginated feeds use keyset cursors built from Postgres's own `created_at::text` (microseconds), never a JS Date. Event reads use `eventColumns` from `events.repository.ts` so every live counter (tickets sold, likes) comes along. Posting is rate-limited per user (`userRateLimit`).
  - Notifications: call `notify(tx, rows)` (`notifications.repository.ts`) inside the same transaction as the change it announces, never after it. Moderation resolves every open report on an item at once (`communityService.act`).
  - Admin account actions (suspend, reinstate, wallet adjustments) call `audit(tx, row)` (`audit.repository.ts`) in the same transaction, always with a reason. Reporting queries live in `dashboard.repository.ts` as SQL; revenue comes from the ledger (purchases minus refunds), never from ticket prices, and days are bucketed in campus time.
  - Production (`docs/DEPLOYMENT.md`, `render.yaml`): one Render service, where the API also serves `apps/web/dist` (`WEB_DIST_DIR`, `lib/web-app.ts`) so the site stays same-origin, plus Neon Postgres. Uploads use `STORAGE=database` (`lib/db-storage.ts`, the `uploads` table) because Render's disk is ephemeral. Helmet's CSP is on, so no inline scripts (the pre-paint theme script lives in `apps/web/public/theme.js`).
  - The demo seed goes through the real services; only history (past events, backdated sales and check-ins) is written as SQL. Cover art is generated (`seed/covers.ts`), so the repo ships no third-party images.
  - CSV downloads go through `toCsv` (`lib/csv.ts`), which escapes cells and defuses spreadsheet formulas.
  - Maps: an event's optional pin is `latitude`/`longitude`/`address` on `events` (all or none, enforced by a check constraint), sent as `location` in the API. Admin place search goes through a `Geocoder` (`lib/geocoder.ts`; Photon in production, restricted to South Africa and biased to campus; `fakeGeocoder` in tests) at `/api/admin/places`, so the browser never calls third parties for search. Moving the pin notifies ticket holders like a venue change.
  - Status changes use conditional updates (`transition(id, from, values)` in the events repository) so concurrent clicks can't both apply.
  - CSRF: `requireSameOrigin` rejects non-GET requests whose `Origin` isn't `WEB_ORIGIN`. In tests, use the `browser()` helper in `test/helpers.ts`, which sets it.
- `apps/web`: React 19 + Vite + Tailwind v4 + shadcn-style components (`components.json`) + Motion (`motion/react`) + TanStack Query + React Router 7 (data router in `src/router.tsx`).
  - Session state: `useSession()` in `lib/auth.ts`. Protect routes with the `requireUser(roles?)` loader, not in components. Forms use react-hook-form + the shared Zod schema; `applyServerError(form, err)` maps API field errors onto inputs.
  - Make every API call through `lib/api.ts` `api<T>()`. It sends cookies, parses JSON and throws `ApiRequestError` carrying the server's error shape.
  - `@/` is an alias for `apps/web/src`.
  - Admin, gate and auth routes are code-split with the `page(() => import(...), 'Name')` helper in `router.tsx`; keep new admin pages lazy so students don't download them.
  - Accessibility: `CardTitle` is an `h2` (cards sit under the page `h1`; never skip levels). Status colours are tuned so text passes 4.5:1 on its own 10% tint, so check contrast with axe before changing them. Charts (Recharts) are `aria-hidden` with a table view as the accessible alternative. Use `Segmented` for one-of-n toggle groups (it adds the 44px hit area).
  - Filters that change what a page shows (Discover, admin lists) live in the URL search params, parsed with the shared Zod query schema.
  - Maps: render through `MapView` (`components/maps/map-view.tsx`), which lazy-loads plain Leaflet so only pages with a map download it. Tiles come from tile.openstreetmap.org (allowed in the CSP `img-src`); the tile layer sends `strict-origin-when-cross-origin` because OSM blocks requests without a Referer and helmet's page policy is `no-referrer`. In tests, mock `@/components/maps/map-view`.

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
