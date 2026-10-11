# Deployment

Production runs as **one Render web service** plus a **Neon Postgres** database.

```
Browser ──HTTPS──▶ Render web service (Node 22)
                     ├─ /api/*        Express API (sessions, SSE, uploads)
                     └─ everything else  built React app (apps/web/dist)
                              │
                              ▼
                     Neon Postgres (data, sessions, uploaded images)
```

Why this shape:

- **One origin.** The API serves the built web app (`WEB_DIST_DIR`), as the Vite proxy does in development. The session cookie stays first-party, and `requireSameOrigin` CSRF checks work unchanged. No CORS is needed.
- **A long-running server, not functions.** The gate's live counters use Server-Sent Events, and sessions live in Postgres. Serverless hosts (Netlify or Vercel functions) cut long connections, so the API runs as a normal Node process.
- **Uploads in Postgres** (`STORAGE=database`). Render's free disk is wiped on every deploy and restart, so cover images and photos are stored in an `uploads` table and served with immutable caching. Uploads are capped at 5 MB, so a demo fits easily in Neon's free 0.5 GB.
- **Same region for app and database** (AWS US East 2 / Render Ohio). Every request makes several database round trips, so keeping them in one data centre matters more than closeness to users. Frankfurt would be closer to South Africa if the project is ever recreated.

## What happens on each deploy

`render.yaml` is a Render Blueprint, so the whole service is defined in the repo.

1. **Build:** `npm ci --include=dev && npm run build` builds the shared package, the API (tsup → `apps/api/dist`) and the web app (Vite → `apps/web/dist`).
2. **Release:** `npm run release -w @monthati/api` (`src/release.ts`) applies pending migrations. If `DEMO_PASSWORD` is set and the database has no accounts yet, it also seeds demo data (`src/seed/demo.ts`). It is safe to run on every start.
3. **Start:** `node dist/server.js`. Render's health check calls `/api/health`, which also pings the database.

## Environment

| Variable | Set by | Notes |
|---|---|---|
| `DATABASE_URL` | you, in Render | Neon **direct** connection string (`…neon.tech/neondb?sslmode=require`). |
| `DEMO_PASSWORD` | you, in Render | Password for the demo accounts. Remove it to stop seeding (seeding only ever runs on an empty database). |
| `SESSION_SECRET`, `TICKET_SIGNING_SECRET` | Render (`generateValue`) | Random 256-bit values. Changing the ticket secret invalidates every issued QR code. |
| `NODE_ENV=production`, `STORAGE=database`, `WEB_DIST_DIR` | `render.yaml` | `production` turns on `Secure` cookies (Render terminates HTTPS and sets `X-Forwarded-Proto`; the app trusts one proxy hop). |
| `WEB_ORIGIN` | automatic | Defaults to Render's `RENDER_EXTERNAL_URL`. Set it only when using a custom domain. |

## Demo accounts

| Role | Sign in with |
|---|---|
| Admin | `admin@monthati.demo` |
| Gate staff | `gate@monthati.demo` |
| Student | `202312345` or `student@monthati.demo` |

All three use `DEMO_PASSWORD`. The seed also creates 15 more students (each with an unguessable password), 10 events with generated cover art (two past, one draft), a month of backdated sales and check-ins, comments, two volunteer applications and one reported comment. That gives every admin screen something to show.

To try the same data locally, run `DEMO_PASSWORD=… npm run db:setup -w @monthati/api` against an empty database.

## Free-tier behaviour

- **Render** spins the service down after 15 minutes without traffic. The next visit takes 30–60 s to wake it. A paid instance stays warm.
- **Neon** suspends compute after 5 idle minutes and resumes in well under a second.
- **One instance only.** The live gate feed (`LiveBus`) is in-process. Before scaling out, swap it for Postgres `LISTEN/NOTIFY` or Redis.

## Starting over

To reset the demo, open the Neon SQL editor and run:

```sql
drop schema public cascade;
create schema public;
drop schema if exists drizzle cascade;
```

Then redeploy, or restart the service from the Render dashboard. The release step migrates and seeds again.
