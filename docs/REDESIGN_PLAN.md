# Monthati Events: Redesign Plan

Status: draft for review. The current Express/EJS app is the reference for what the system must do. It is not a codebase to refactor.

## Decisions (2026-10-10)

- **Repo:** same repo, on the `redesign` branch. The old app moves to `legacy/` and is deleted once the new app reaches feature parity.
- **Stack:** React + TypeScript (Vite), Node + Express + TypeScript, PostgreSQL with **Drizzle**.
- **Design:** the ui-ux-pro-max skill for the design system, plus Framer Motion.
- **Hosting:** decide later. Config stays independent of any hosting platform (env-driven, storage behind an interface).
- **Standout features (all four):** tamper-proof QR tickets, wallet ledger with auto refunds, live check-in dashboard, motion-rich UX.

## 1. What the current app does (feature inventory)

| Area | Current behaviour | Problems |
|---|---|---|
| Accounts | Three roles share one `users` table (`user_type`). Students sign up with a 9-digit student ID. | Anyone can register as **admin** (`/admin/signup`) or **security** (`/security/register`). Login and session code is copied three times. |
| Events | Admins create, edit and cancel events: cover image, start/end, venue, fee, payment type, volunteers allowed. | No capacity, no draft state, no categories or search. Cancelling doesn't refund ticket holders. |
| Tickets | 1. A student "reserves" a ticket and the wallet is debited. 2. An admin manually "assigns" it, and the QR data is built in the browser. 3. Security scans the QR, which contains JSON. | The admin step is unnecessary friction. QR codes can be forged. Scanning isn't atomic, so double entry is possible. |
| Wallet | `users.wallet` is a single number. Admins deposit and withdraw, and students deposit and withdraw. A `transactions` table exists. | The balance can drift from the transaction history. Money is stored as floats. The early-return path leaks a pool connection. |
| Social | Event likes, threaded comments with reactions, a per-event photo wall with hearts and captions. | — |
| Volunteers | Students apply with a role and description. Admins accept or decline, singly or all at once. | — |
| Moderation | Users report comments and photos. Admins resolve or dismiss reports, delete content, and ban, unban or delete users. | — |
| Notifications | Built when the page loads, from report and volunteer status changes. | No table, so there's no read state for most notification types and no ticket or event notifications. |
| Gate | Security dashboard, camera QR scanner, scan result screen, `scan_logs`. | — |

## 2. Redesigned product: roles and workflows

**Roles:** `student`, `staff` (gate scanning), `admin` (organiser). Only admins can create staff and admin accounts, through invites. There is no public sign-up for privileged roles.

### Student
1. Sign up or log in (student ID + password).
2. **Discover:** browse and search events, filter by date, category and price (free or paid), see trending events.
3. **Event page:** details, live "spots left", like, comments, photo wall (unlocks after the event starts), volunteer application.
4. **Get a ticket in one step:** the wallet is debited and a ticket with a signed QR code is issued **straight away**, without waiting for an admin. Free events need only one tap.
5. **My tickets:** upcoming and past tickets, a full-screen QR (works offline once loaded), and the option to cancel and get a refund before a cutoff.
6. **Wallet:** balance, ledger history, top-up (simulated payment provider), withdraw.
7. **Notifications:** a real inbox. Examples: ticket issued, event changed or cancelled (with refund), volunteer decision, outcome of a report.

### Admin (organiser)
1. **Dashboard:** KPIs (revenue, tickets sold, check-in rate, active users) and charts.
2. **Events:** create as a draft, then publish. Edit, cancel (refunds everyone automatically and notifies them), duplicate.
3. **Per event:** attendee list and live check-ins, volunteer queue, photo wall moderation, CSV export.
4. **Users:** search, view, suspend or reinstate, adjust wallet (every adjustment is logged with a reason).
5. **Moderation queue:** reports for comments and photos, with actions (remove content, warn, suspend).
6. **Staff:** invite gate staff and assign them to events.

### Staff (gate)
1. Log in. The app is mobile-first.
2. Choose an assigned event and open the scanner.
3. Scan a QR code. The result shows instantly, full screen: ✅ valid (student name and photo) / ⚠️ already used (time and gate) / ❌ invalid or wrong event.
4. Live counter of how many people are checked in out of the capacity.

### Standout portfolio features (pick 2–3 to polish)
- **Tamper-proof QR tickets:** the payload is signed with HMAC, and check-in is a single atomic SQL update, so a ticket can't be used twice even when two gates scan at once.
- **Double-entry wallet ledger:** the balance is calculated from immutable ledger entries. Amounts are integer cents. Refunds are automatic.
- **Live check-in dashboard:** the admin's attendance counter updates in real time (Server-Sent Events).
- **Polished motion UX:** Framer Motion page transitions, shared-element event cards → event page, ticket "issue" animation.

## 3. Architecture

Monorepo using npm workspaces:

```
apps/
  web/        React 18 + TypeScript + Vite
  api/        Node + Express + TypeScript
packages/
  shared/     Zod schemas + inferred types shared by web and api
```

| Concern | Choice | Why |
|---|---|---|
| Validation | **Zod** in `packages/shared` | One schema checks both the API input and the React forms. |
| DB access | **Drizzle ORM** + drizzle-kit migrations | Close to SQL, fully typed, real migration files. |
| Auth | httpOnly cookie sessions (`express-session` + `connect-pg-simple`), **argon2id** (`@node-rs/argon2`), CSRF protection by `Origin` check plus SameSite=Lax cookies | Simpler and safer than JWTs in localStorage for a same-site app. Argon2id is the current OWASP recommendation over bcrypt. |
| API structure | `routes → controllers (thin) → services (business logic) → repositories (Drizzle)` | No more 2,400-line controllers. Services can be tested on their own. |
| Authorization | One `requireRole(...roles)` middleware | Replaces the six copied auth/check files. |
| Errors | Typed `AppError` + central error handler + consistent JSON error shape | — |
| Frontend data | **TanStack Query** + React Router | Caching, optimistic likes and reactions, loading states. |
| Forms | react-hook-form + zod resolver | — |
| UI | **Tailwind + shadcn/ui + Framer Motion**, design system from the **ui-ux-pro-max** skill | — |
| Uploads | multer behind a `StorageService` interface (local disk now, S3/Cloudinary later) | Uploaded files are no longer committed to git. |
| Config | `.env` validated with Zod at startup | No hardcoded secrets. |
| Quality | ESLint + Prettier, `tsc --noEmit`, Vitest + Supertest (API), Vitest + Testing Library (web), Playwright (core end-to-end flows), GitHub Actions CI | — |

## 4. Data model (first draft)

`users` (role, student_id, status) · `sessions` · `events` (status: draft/published/cancelled/completed, capacity, category, price_cents) · `tickets` (status: valid/used/cancelled/refunded, checked_in_at, checked_in_by) · `wallet_ledger` (user_id, amount_cents ±, kind, ref) · `comments` (parent_id) · `comment_reactions` · `event_likes` · `photos` · `photo_likes` · `volunteer_applications` · `reports` (polymorphic target) · `notifications` · `event_staff` · `scan_logs` · `audit_log`

## 5. Delivery phases

Each phase is a vertical slice: schema → API → UI → tests. Each phase gets its own branch and PR.

0. ✅ **Setup (done 2026-10-10):** monorepo, tooling, CI, env config, DB + migrations, design system (ui-ux-pro-max), app shell, layout and motion primitives.
1. ✅ **Auth and roles (done 2026-10-11):** student sign-up and login (student number or email), Postgres-backed sessions, `requireRole`, single-use hashed admin invites for staff and admins, `user:create-admin` CLI for the first admin, rate-limited auth routes. Invite links are shared by hand until email delivery lands in phase 6.
2. ✅ **Events (done 2026-10-11):** admin create/edit with draft → publish → cancel (with reason), unpublish, duplicate, delete drafts; cover uploads behind a `StorageService` with byte-level type checks; Discover with search, category, price and date filters in the URL; event page with the card → hero shared-element transition; all times entered and shown in campus time (SAST). Deferred to phase 3, marked TODO in `events.service.ts`: refunds on cancel, and blocking unpublish, capacity cuts and price changes once tickets are sold. "Trending" waits for ticket and like data (phases 3 and 5).
3. ✅ **Wallet and tickets (done 2026-10-11):** append-only ledger in cents with running balances; idempotent top-up and withdrawal (client request ids) through a simulated `PaymentProvider`, with failed payouts reversed by a compensating entry; one-step purchase under event and user row locks with a database-enforced one-active-ticket rule; HMAC-signed QR payloads plus short gate codes; My Tickets, a ticket page with full-screen gate view and an offline copy (cleared on sign-in or sign-out); holder cancellation with refunds (paid: until 24h before; free: until the start); event cancellation refunds everyone in the same transaction; price locked and capacity floored once tickets are sold. Still simulated: real payment gateway.
4. ✅ **Gate (done 2026-10-11):** admins assign gate staff per event; staff see their events and scan with the phone camera (@zxing/browser) or by typing the short code; signature-verified QR, single conditional-UPDATE check-in (race-tested with simultaneous gates), results for admitted / already used (when and by whom) / invalid / wrong event / cancelled / gates closed (doors open 3h before); every scan logged; live counter on the scanner and an admin Live check-ins page over SSE. Camera scanning needs HTTPS, so on phones it is tested after deployment.
5. ✅ **Social (done 2026-10-11):** event likes (optimistic, counts on cards); comments threaded one level deep with edit, soft delete (placeholder kept while replies exist) and five Lucide-icon reactions; a photo wall that opens at the start time, where ticket holders post (byte-checked images, captions) and anyone can browse and like; authors and admins delete; per-user posting limits; names shown as "First L.". Reporting and the moderation queue arrive in phase 6.
6. **Volunteers, moderation and notifications.**
7. **Admin dashboard and analytics, polish, accessibility pass.**
8. **Ship:** seed data, demo accounts for each role, deployment, README with architecture diagram and screenshots.

The legacy app stays runnable until phase 6 reaches feature parity. After that it's deleted.
