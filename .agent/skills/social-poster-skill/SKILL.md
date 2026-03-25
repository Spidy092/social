---
name: social-poster
description: >
  Builds the social-poster internal tool — an Express + EJS app that posts to
  Instagram, Facebook, LinkedIn, and YouTube from one interface. Invoke this skill
  when the user asks to build, extend, fix, or debug any part of the social-poster
  project. Covers: project setup, auth, uploads, platform services, scheduler,
  AI captions, analytics, OAuth, and deployment.
---

# Social Poster — Antigravity Agent Skill

## What this skill does

This skill gives the agent deep knowledge of the social-poster project: its
architecture, conventions, file structure, and phase-by-phase build plan.
When invoked, the agent must read this file fully before writing any code.

---

## Core rules — always follow these

- This is a **unified Express + EJS app**. Never suggest splitting into separate
  frontend/backend folders. Never suggest React, Vite, or any frontend build tool.
- Auth is **session-based** (express-session + connect-pg-simple). Never use JWT.
- Styling is **Tailwind CSS via CDN** in the EJS layout. No PostCSS, no build step.
- Client-side interactivity is **vanilla JS** in `public/js/app.js`. No frameworks.
- Scheduling uses **node-cron** — no Redis, no Bull, no queues.
- Always wrap every async route and cron job in **try/catch**.
- Never hardcode secrets — always use `process.env.*`.
- Never install packages not listed in `resources/PACKAGES.md` without asking.
- After writing code for any phase, always output a **test checklist** so the user
  can verify it works before moving to the next phase.

---

## Project structure (memorise this)

```
social-poster/
├── src/
│   ├── routes/         auth.js, dashboard.js, posts.js, platforms.js, captions.js, analytics.js
│   ├── services/       instagram.js, facebook.js, linkedin.js, youtube.js, cloudinary.js, claude.js
│   ├── scheduler/      postScheduler.js
│   ├── db/             index.js, migrations/001_initial.sql
│   └── middleware/     auth.js, upload.js
├── views/
│   ├── layouts/        main.ejs
│   ├── partials/       nav.ejs, flash.ejs
│   ├── auth/           login.ejs
│   ├── dashboard.ejs, upload.ejs, schedule.ejs, analytics.ejs, platforms.ejs
├── public/
│   ├── css/            app.css
│   └── js/             app.js
├── app.js              ← Express entry point
├── .env
└── docker-compose.yml
```

---

## Database schema (reference before any DB query)

Read `resources/SCHEMA.sql` for the full schema.

Key tables:
- `users` — id (UUID), email, password_hash
- `platform_connections` — user_id FK, platform, access_token, refresh_token, token_expires_at, platform_username
- `posts` — user_id FK, media_url, media_type, caption_original, platforms (JSONB), scheduled_at, status
- `post_results` — post_id FK, platform, status, platform_post_id, error_message
- `analytics_snapshots` — post_result_id FK, likes, comments, shares, views, reach

Post statuses: `draft` → `pending` → `publishing` → `published` | `failed`

---

## Phase guide — which phase to build

When the user asks to build a feature, map it to the correct phase and follow
the instructions in `resources/PHASES.md`:

| User says | Phase |
|---|---|
| "set up the project" / "initialise" | Phase 1 |
| "login" / "auth" / "session" | Phase 2 |
| "upload" / "cloudinary" / "file" | Phase 3 |
| "instagram" / "facebook" / "post to platforms" | Phase 4 |
| "scheduler" / "cron" / "schedule a post" | Phase 5 |
| "AI caption" / "generate caption" / "claude" | Phase 6 |
| "dashboard" / "analytics" | Phase 7 (Phase 8 for analytics view) |
| "oauth" / "connect instagram" / "connect account" | Phase 9 |
| "deploy" / "railway" / "production" | Phase 10 |

---

## EJS conventions

- Every page route must pass `{ activePage: 'pagename' }` to the view so the
  sidebar can highlight the active link.
- Flash messages are always passed to views via `res.locals` in app.js middleware:
  `res.locals.success = req.flash('success')` and `res.locals.error = req.flash('error')`
- The login page must set `layout: false` to skip the main layout.
- Form DELETEs must use method-override: `<input type="hidden" name="_method" value="DELETE">`
- AJAX calls (e.g. AI caption generation) go through `fetch()` in `public/js/app.js`
  and hit endpoints that return JSON. These endpoints must check `req.session.userId`
  and return `{ error }` with status 401 if missing.

---

## Platform API quick reference

Read `resources/PLATFORM_APIS.md` for full details.

| Platform | Key constraint |
|---|---|
| Instagram | Must poll media container status before publishing. Never skip the polling loop. |
| Facebook | Post to Page (not personal profile). Get Page ID via `/me/accounts` first. |
| LinkedIn | Use `ugcPosts` endpoint. Person URN = `urn:li:person:{sub}` from `/v2/userinfo`. |
| YouTube | Videos only. No image support. Use resumable upload for files > 5MB. |

When a platform API call returns 401, attempt token refresh once using
`refresh_token` from `platform_connections`, update the DB row, then retry.

---

## Scheduler critical rule

The cron job in `postScheduler.js` MUST:
1. Set `status = 'publishing'` IMMEDIATELY before calling any platform API.
   This prevents double-publishing if the job overlaps.
2. Only THEN call the platform services in parallel.
3. On all success → set `status = 'published'`
4. On any failure → set `status = 'failed'`

If this order is wrong, the same post will be sent multiple times. Flag this
if the agent is about to write it incorrectly.

---

## Session and auth middleware

`src/middleware/auth.js` exports `requireLogin`:
- Checks `req.session.userId`
- If missing: redirect to `/login`
- If present: fetch user from DB, attach as `req.user`, call `next()`

In `app.js`, apply `requireLogin` to all routes EXCEPT:
`/login`, `/logout`, `/health`, `/platforms/*/callback` (OAuth needs no session)

---

## Environment variables

Read `resources/ENV.md` for the full list. Key ones:

```
PORT, DATABASE_URL, SESSION_SECRET
CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
ANTHROPIC_API_KEY
META_APP_ID, META_APP_SECRET, META_REDIRECT_URI
LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, LINKEDIN_REDIRECT_URI
GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI
APP_URL, ADMIN_EMAIL, ADMIN_PASSWORD
```

---

## How to run locally

```bash
docker-compose up -d          # start PostgreSQL
npm run db:migrate             # run SQL migrations
node src/db/seed.js            # create admin user (run once)
npm start                      # start Express on PORT
```

Visit http://localhost:3000 — should redirect to /login.

---

## Deployment (Railway)

Single service deployment — no split. The `railway.toml` start command is:
```
npm run db:migrate && npm start
```
After first deploy, run the seed script once:
```
railway run node src/db/seed.js
```
Then update OAuth redirect URIs in Meta, Google, and LinkedIn dashboards
to use the Railway app URL.
