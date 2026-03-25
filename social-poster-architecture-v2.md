# Social Media Multi-Platform Poster — Complete Architecture & Agent Prompts

> Hand this file to any AI coding agent (Antigravity, Cursor, Claude Code, etc.).
> Work through each phase in order. Each phase prompt is self-contained.

---

## Project Overview

An **internal web tool** (single unified app — no separate frontend/backend) that lets you
upload a post (image/video/caption) once and publish or schedule it to Instagram, Facebook,
LinkedIn, and YouTube — with AI-generated captions per platform and a basic analytics dashboard.

Built with Express + EJS server-side rendering. No React, no separate frontend build step,
no CORS. One app, one server, one deploy.

---

## Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Server | Node.js 20 + Express 5 | Serves HTML + handles API logic |
| Templating | EJS | Server-side rendered views |
| Styling | Tailwind CSS (CDN) + vanilla JS | No build step needed |
| Database | PostgreSQL 15 | Posts, users, schedules |
| Scheduler | node-cron | Runs every 60s, no Redis needed |
| File Storage | Cloudinary | Free tier, handles images + videos |
| AI Captions | Anthropic Claude API | claude-sonnet-4-20250514 |
| Auth | Session-based (express-session + bcryptjs) | Simpler than JWT for internal tools |
| Deploy | Railway (app + DB together) | One deploy, no split |

---

## Folder Structure

```
social-poster/                     # Single unified app — no frontend/backend split
├── src/
│   ├── routes/
│   │   ├── auth.js                # GET/POST /login, /logout
│   │   ├── dashboard.js           # GET / (dashboard page)
│   │   ├── posts.js               # GET/POST /posts, /posts/:id
│   │   ├── platforms.js           # GET /platforms/connect, /callback
│   │   ├── captions.js            # POST /captions/generate (AJAX endpoint)
│   │   └── analytics.js           # GET /analytics
│   ├── services/
│   │   ├── instagram.js
│   │   ├── facebook.js
│   │   ├── linkedin.js
│   │   ├── youtube.js
│   │   ├── cloudinary.js
│   │   └── claude.js
│   ├── scheduler/
│   │   └── postScheduler.js       # node-cron job
│   ├── db/
│   │   ├── index.js               # pg pool
│   │   └── migrations/            # SQL migration files
│   └── middleware/
│       ├── auth.js                # session check middleware
│       └── upload.js              # multer config
│
├── views/                         # EJS templates
│   ├── layouts/
│   │   └── main.ejs               # Base layout (nav + sidebar)
│   ├── partials/
│   │   ├── nav.ejs
│   │   └── flash.ejs              # Flash messages
│   ├── auth/
│   │   └── login.ejs
│   ├── dashboard.ejs
│   ├── upload.ejs
│   ├── schedule.ejs
│   ├── analytics.ejs
│   └── platforms.ejs
│
├── public/                        # Static assets served by Express
│   ├── css/
│   │   └── app.css                # Custom styles (minimal — Tailwind CDN handles most)
│   └── js/
│       └── app.js                 # Vanilla JS for AJAX calls (captions, file preview)
│
├── app.js                         # Express entry point
├── .env
├── docker-compose.yml             # Local PostgreSQL
└── package.json
```

---

## Database Schema

```sql
-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Connected platform accounts (OAuth tokens per user per platform)
CREATE TABLE platform_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,           -- 'instagram' | 'facebook' | 'linkedin' | 'youtube'
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  platform_user_id TEXT,
  platform_username TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, platform)
);

-- Posts
CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  media_url TEXT NOT NULL,           -- Cloudinary URL
  media_type TEXT NOT NULL,          -- 'image' | 'video'
  caption_original TEXT,             -- User's original caption
  platforms JSONB NOT NULL,          -- { instagram: { caption }, facebook: { caption }, ... }
  scheduled_at TIMESTAMPTZ,          -- NULL = post immediately
  status TEXT DEFAULT 'draft',       -- 'draft' | 'pending' | 'publishing' | 'published' | 'failed'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Post results per platform
CREATE TABLE post_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  status TEXT NOT NULL,              -- 'success' | 'failed'
  platform_post_id TEXT,             -- ID returned by the platform
  error_message TEXT,
  posted_at TIMESTAMPTZ DEFAULT NOW()
);

-- Analytics snapshots (pulled every 24h)
CREATE TABLE analytics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_result_id UUID REFERENCES post_results(id) ON DELETE CASCADE,
  likes INT DEFAULT 0,
  comments INT DEFAULT 0,
  shares INT DEFAULT 0,
  views INT DEFAULT 0,
  reach INT DEFAULT 0,
  snapped_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Environment Variables

### `.env`

```env
PORT=3000
DATABASE_URL=postgresql://user:password@localhost:5432/socialposter
SESSION_SECRET=your_long_random_session_secret_here

CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

ANTHROPIC_API_KEY=

# Meta (Instagram + Facebook)
META_APP_ID=
META_APP_SECRET=
META_REDIRECT_URI=http://localhost:3000/platforms/meta/callback

# LinkedIn
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
LINKEDIN_REDIRECT_URI=http://localhost:3000/platforms/linkedin/callback

# YouTube (Google)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/platforms/youtube/callback

APP_URL=http://localhost:3000
```

---

## Routes

```
Auth (renders EJS pages)
  GET    /login                      → login.ejs
  POST   /login                      → authenticate, redirect to /
  GET    /logout                     → destroy session, redirect to /login

Dashboard
  GET    /                           → dashboard.ejs (post summary, stats)

Posts
  GET    /upload                     → upload.ejs (create new post form)
  POST   /posts                      → handle form submit (multipart), redirect to /schedule
  GET    /schedule                   → schedule.ejs (list pending posts)
  GET    /posts/:id                  → post detail page
  POST   /posts/:id/delete           → delete post, redirect to /schedule
  POST   /posts/:id/publish-now      → publish immediately (AJAX or form POST)

Platform OAuth
  GET    /platforms                  → platforms.ejs (connection status page)
  GET    /platforms/meta/connect     → redirect to Meta OAuth
  GET    /platforms/meta/callback    → handle callback, save token, redirect to /platforms
  GET    /platforms/linkedin/connect → redirect to LinkedIn OAuth
  GET    /platforms/linkedin/callback
  GET    /platforms/youtube/connect  → redirect to Google OAuth
  GET    /platforms/youtube/callback
  POST   /platforms/:platform/disconnect → delete connection, redirect to /platforms

AI Captions (AJAX — called from upload.ejs via fetch())
  POST   /captions/generate          → returns JSON { captions: { instagram, facebook, ... } }

Analytics
  GET    /analytics                  → analytics.ejs (stats dashboard)
```

> Note: No `/api/` prefix needed — this is a unified app. AJAX endpoints return JSON,
> all other routes render EJS views.

---

## Scheduler Logic

```javascript
// Runs every 60 seconds
// Fetches posts where scheduled_at <= NOW() AND status = 'pending'
// For each post: post to each selected platform in parallel
// On success: mark status = 'published', save post_results
// On failure: mark status = 'failed', save error in post_results
```

---

## Platform API Notes

| Platform | API | Key Limits |
|---|---|---|
| Instagram | Meta Graph API v18 | Needs Business/Creator account. Reels via `POST /me/media` |
| Facebook | Meta Graph API v18 | Same app as Instagram. Pages API for posting |
| LinkedIn | LinkedIn Marketing API v2 | `ugcPosts` endpoint for images/video |
| YouTube | YouTube Data API v3 | Videos via resumable upload. Shorts = video < 60s + #Shorts |

---

---

# PHASE PROMPTS FOR CODING AGENT

Copy each prompt below and give it to your coding agent one phase at a time.

---

## Phase 1 — Project Setup + Database

```
You are building an internal social media multi-platform posting tool called "social-poster".
It is a UNIFIED Express + EJS app — no separate frontend, no React, no Vite, no build step.
Everything is server-side rendered with EJS. Tailwind CSS is loaded via CDN in the EJS layout.

TASK: Set up the complete project scaffold and database layer.

1. Create this folder structure in a single project root:
   - src/routes/, src/services/, src/scheduler/, src/db/migrations/, src/middleware/
   - views/layouts/, views/partials/, views/auth/
   - public/css/, public/js/

2. Install these packages:
   express, ejs, express-ejs-layouts, pg, dotenv, cors, helmet,
   express-session, connect-pg-simple, bcryptjs, multer, node-cron,
   uuid, cloudinary, @anthropic-ai/sdk, axios, connect-flash, method-override

3. Create src/db/index.js — a pg Pool using DATABASE_URL from .env

4. Create src/db/migrations/001_initial.sql with this exact schema:
   - users (id UUID PK, email UNIQUE, password_hash, created_at)
   - platform_connections (id, user_id FK, platform, access_token, refresh_token,
     token_expires_at, platform_user_id, platform_username, created_at)
     UNIQUE(user_id, platform)
   - posts (id, user_id FK, media_url, media_type, caption_original,
     platforms JSONB, scheduled_at, status DEFAULT 'draft', created_at)
   - post_results (id, post_id FK, platform, status, platform_post_id,
     error_message, posted_at)
   - analytics_snapshots (id, post_result_id FK, likes, comments, shares,
     views, reach, snapped_at)

5. Add db:migrate npm script that runs the SQL file using pg.

6. Create app.js — Express entry point with:
   - helmet(), express.json(), express.urlencoded({ extended: true })
   - method-override for DELETE/PUT from HTML forms
   - express-session with connect-pg-simple store, SESSION_SECRET from .env
   - connect-flash for flash messages
   - Set view engine to EJS, use express-ejs-layouts, layout = 'layouts/main'
   - express.static('public')
   - GET /health → res.json({ status: 'ok' })
   - app.listen on PORT from .env

7. Create views/layouts/main.ejs:
   - Full HTML shell with Tailwind CDN in <head>
   - Sidebar nav: Dashboard, Upload, Schedule, Platforms, Analytics
   - Flash message partial included at top of body
   - <%- body %> for page content

8. Create views/partials/flash.ejs — renders success/error flash messages as banners.

9. Create .env with all variables from the architecture doc (placeholder values).
   Create docker-compose.yml with postgres:15 on port 5432.

Verify: docker-compose up -d → npm start → GET /health returns 200,
and visiting http://localhost:3000 renders the EJS layout without errors.
```

---

## Phase 2 — Auth (Login / Session / Middleware)

```
You are continuing to build the "social-poster" Express + EJS app.
The server and PostgreSQL are already set up from Phase 1.
This is an INTERNAL tool — only one login page, no registration page needed.
Auth is session-based (express-session), NOT JWT.

TASK: Build login, session auth, and protection middleware.

1. Create a seed script src/db/seed.js:
   - Creates one admin user with email + hashed password (values from .env: ADMIN_EMAIL, ADMIN_PASSWORD)
   - Run once with: node src/db/seed.js
   - Add ADMIN_EMAIL and ADMIN_PASSWORD to .env

2. Create src/routes/auth.js:

   GET /login
   - If session exists → redirect to /
   - Render views/auth/login.ejs with any flash messages

   POST /login
   - Body: { email, password }
   - Fetch user from DB by email
   - Compare password with bcryptjs
   - On success: set req.session.userId = user.id, redirect to /
   - On fail: flash error 'Invalid email or password', redirect to /login

   GET /logout
   - Destroy session
   - Redirect to /login

3. Create views/auth/login.ejs:
   - Standalone page (no sidebar layout — override layout to false for this route)
   - Centered login card with email + password fields
   - Shows flash error if present
   - Tailwind CSS from CDN
   - POST action to /login

4. Create src/middleware/auth.js:
   - requireLogin middleware: checks req.session.userId
   - If missing → redirect to /login
   - If present → fetch user from DB, attach to req.user, call next()

5. Mount auth router in app.js at /
   Apply requireLogin middleware to ALL routes EXCEPT /login, /logout, /health

6. Create GET / route (stub) that just renders a basic dashboard.ejs placeholder
   so the redirect after login works.

Test: npm start → visit http://localhost:3000 → should redirect to /login →
login with seed credentials → should redirect to / showing placeholder dashboard.
```

---

## Phase 3 — File Upload + Cloudinary

```
You are continuing to build the "social-poster" Express + EJS app.
Session auth is working from Phase 2. All routes are protected by requireLogin.

TASK: Build file upload with Cloudinary and the upload page.

1. Create src/services/cloudinary.js:
   - Initialize Cloudinary with env vars
   - Export uploadFile(filePath, options) → { url, publicId, resourceType }
   - Export deleteFile(publicId)
   - Images: resource_type: 'image', eager: [{ width: 1080, crop: 'limit' }]
   - Videos: resource_type: 'video', eager: [{ format: 'mp4' }]

2. Create src/middleware/upload.js:
   - multer diskStorage, dest: /tmp/uploads
   - Accept field name: 'media'
   - Allow: jpeg, png, webp, mp4, mov, quicktime
   - Max size: 500MB

3. Create src/routes/posts.js:

   GET /upload
   - Render views/upload.ejs
   - Pass: platforms list, any flash messages

   POST /posts (uses upload middleware)
   - Accept multipart: { media(file), caption, platforms(JSON), scheduled_at? }
   - Upload to Cloudinary, delete temp file
   - Insert into posts table, status = scheduled_at ? 'pending' : 'draft'
   - Flash success, redirect to /schedule

   GET /schedule
   - Fetch all posts for req.user.id ordered by created_at DESC
   - Join with post_results
   - Render views/schedule.ejs with posts data

   POST /posts/:id/delete
   - Delete from Cloudinary
   - Delete from DB
   - Flash success, redirect to /schedule

4. Create views/upload.ejs:
   - Form with enctype="multipart/form-data", POST to /posts
   - File drag-drop area with preview (image thumbnail or video player)
   - Caption textarea
   - Platform checkboxes: Instagram, Facebook, LinkedIn, YouTube
   - Per-platform caption textareas (shown/hidden based on checkbox)
   - "Generate AI Captions" button — calls POST /captions/generate via fetch()
     and populates the per-platform textareas with the response
   - datetime-local input for scheduling (optional)
   - Submit button: "Schedule Post" or "Post Now"
   - All interactivity in public/js/app.js (vanilla JS, no framework)

5. Create views/schedule.ejs:
   - Table of posts: thumbnail, caption preview, platforms badges, scheduled time, status
   - "Post Now" button → POST /posts/:id/publish-now
   - "Delete" button → POST /posts/:id/delete (method-override)
   - Status badges with colors (pending=yellow, published=green, failed=red)

Mount posts router in app.js.
```

---

## Phase 4 — Platform Services (Post to Each Platform)

```
You are continuing to build the "social-poster" backend.
File upload and posts DB are already set up.

TASK: Build the posting service for each social platform.

Create backend/src/services/ — one file per platform.
Each service must export a single async function: postContent(connection, postData)
where connection = row from platform_connections, postData = { mediaUrl, mediaType, caption }
Each function returns { platformPostId } on success or throws an error.

--- instagram.js ---
Use Meta Graph API v18.
1. Upload the media:
   - Image: POST /me/media with image_url + caption
   - Video/Reel: POST /me/media with media_type=REELS, video_url
2. Wait for media container status to be FINISHED (poll /CONTAINER_ID?fields=status_code every 5s, max 10 attempts)
3. Publish: POST /me/media_publish with creation_id
4. Return { platformPostId: published media ID }

--- facebook.js ---
Use Meta Graph API v18 (same access token as Instagram, different endpoint).
1. Get the Page ID: GET /me/accounts — take the first page
2. Image: POST /PAGE_ID/photos with url + caption
3. Video: POST /PAGE_ID/videos with file_url + description
4. Return { platformPostId }

--- linkedin.js ---
Use LinkedIn Marketing API v2.
1. Get person URN: GET /v2/userinfo — returns sub as person ID, URN = urn:li:person:{id}
2. Register upload (for image): POST /v2/assets?action=registerUpload
3. Upload binary to the uploadUrl returned
4. Create ugcPost: POST /v2/ugcPosts with author, lifecycleState=PUBLISHED,
   specificContent.shareMediaCategory=IMAGE or NONE (text only)
5. Return { platformPostId: ugcPost ID }

--- youtube.js ---
Use YouTube Data API v3.
1. Only handle video (mediaType === 'video'), throw error for images.
2. Use resumable upload to POST https://www.googleapis.com/upload/youtube/v3/videos
   with uploadType=resumable
3. Set snippet.title = first 100 chars of caption, snippet.description = caption,
   status.privacyStatus = 'public'
4. Return { platformPostId: video ID }

--- index.js (services/platforms/index.js) ---
Export postToPlatform(platform, connection, postData) that routes to the right service.

Note: Use axios for all HTTP calls. Handle token refresh logic:
if a request returns 401, attempt to refresh the token using the refresh_token
stored in platform_connections, update the DB row, retry once.
```

---

## Phase 5 — Scheduler (Cron Job)

```
You are continuing to build the "social-poster" backend.
All platform services are ready from Phase 4.

TASK: Build the scheduler that auto-publishes pending posts.

Create backend/src/scheduler/postScheduler.js:

1. Use node-cron to run a job every 60 seconds: '* * * * *'

2. The job function should:
   a. Query posts WHERE status = 'pending' AND scheduled_at <= NOW()
   b. For each post:
      - Update status = 'publishing' immediately (prevents double-publish)
      - Parse the platforms JSONB field to get which platforms + captions
      - For each platform in the post:
        * Fetch the platform_connection for this user + platform
        * Call postToPlatform(platform, connection, postData)
        * Insert a row into post_results with status = 'success' and platformPostId
        * On error: insert post_results row with status = 'failed' and error_message
      - If ALL platforms succeeded: UPDATE posts SET status = 'published'
      - If ANY platform failed: UPDATE posts SET status = 'failed'

3. Wrap everything in try/catch — the cron job must never crash the server.

4. Log each publish attempt: console.log with timestamp, post ID, platform, result.

5. Start the scheduler in backend/src/index.js by importing and calling startScheduler().

6. Also create POST /api/posts/:id/publish-now route in posts.js:
   - Protected route
   - Immediately runs the same publish logic for a single post (ignore scheduled_at)
   - Returns { results: [{ platform, status, platformPostId }] }
```

---

## Phase 6 — AI Caption Generator

```
You are continuing to build the "social-poster" backend.
The core posting and scheduling is working.

TASK: Build the AI caption generation endpoint using Claude API.

1. Create backend/src/services/claude.js:
   - Initialize Anthropic client with ANTHROPIC_API_KEY
   - Export generateCaptions(originalCaption, platforms[])
   - For each platform in the array, generate a tailored caption
   - Use model: claude-sonnet-4-20250514, max_tokens: 1000
   - Use a single API call asking Claude to return JSON with one key per platform
   
   System prompt:
   "You are a social media expert. Given a base caption, rewrite it optimized
   for each requested platform. Return ONLY a JSON object with platform names
   as keys and the rewritten caption as values. No markdown, no explanation.
   
   Platform guidelines:
   - instagram: casual, emojis, 3-5 hashtags at end, max 300 chars
   - facebook: conversational, no hashtags, can be longer, personal tone
   - linkedin: professional, insight-driven, 1-2 hashtags max, 150-300 chars
   - youtube: SEO-friendly title-style first line, then description, include keywords"
   
   User prompt: "Base caption: {originalCaption}\nPlatforms: {platforms.join(', ')}"

2. Create backend/src/routes/captions.js:

   POST /api/captions/generate (protected)
   - Body: { caption: string, platforms: string[] }
   - Validate: caption non-empty, platforms is non-empty array of valid platform names
   - Call generateCaptions()
   - Return: { captions: { instagram: '...', facebook: '...', ... } }

3. Mount at /api/captions in index.js

4. Handle Claude API errors gracefully — if the API fails, return 503 with
   { error: 'Caption generation unavailable, please write captions manually' }
```

---

## Phase 7 — Analytics

```
You are continuing to build the "social-poster" backend.
Posts are being published and results saved in post_results.

TASK: Build the analytics system.

1. Create backend/src/routes/analytics.js:

   GET /api/analytics (protected)
   - Returns aggregated stats for the current user:
     {
       totalPosts: number,
       publishedPosts: number,
       failedPosts: number,
       byPlatform: {
         instagram: { posts: number, totalLikes: number, totalViews: number },
         facebook:  { ... },
         linkedin:  { ... },
         youtube:   { ... }
       },
       recentPosts: [ last 10 posts with their results ]
     }
   - Query: JOIN posts → post_results → analytics_snapshots
   
   GET /api/analytics/:postId (protected)
   - Returns detailed stats for one post across all platforms
   - Verify the post belongs to req.user.userId

2. Create backend/src/services/analyticsSync.js:
   - Export syncAnalytics() function
   - For each platform, fetch current stats for published posts using platform APIs:
     * Instagram: GET /{media-id}/insights?metric=likes,comments,shares,reach
     * Facebook: GET /{post-id}/insights
     * LinkedIn: GET /v2/socialMetadata/{ugcPostId}
     * YouTube: GET /youtube/v3/videos?part=statistics&id={videoId}
   - Upsert into analytics_snapshots (insert or update if same post_result + same day)
   - Schedule this with node-cron every 24 hours: '0 2 * * *' (2am daily)

3. Add a GET /api/analytics/sync endpoint (protected) that manually triggers syncAnalytics()
   for the current user — useful for testing.

4. Mount at /api/analytics in index.js
```

---

## Phase 8 — Dashboard + Analytics Views

```
You are continuing to build the "social-poster" Express + EJS app.
All backend services and scheduling are working from Phases 4-7.

TASK: Build the dashboard and analytics pages.

1. Create src/routes/dashboard.js:

   GET /
   - Query: total posts, published count, pending count, failed count for req.user.id
   - Query: last 10 posts with their post_results
   - Render views/dashboard.ejs with this data

2. Create views/dashboard.ejs:
   - 4 summary stat cards: Total Posts, Published, Pending, Failed
   - Recent posts table: thumbnail, caption preview, platform badges, status, time
   - "Create New Post" button linking to /upload
   - Quick platform connection status bar (which platforms are connected)

3. Create src/routes/analytics.js:

   GET /analytics
   - Aggregate stats from analytics_snapshots joined with post_results and posts
   - Group by platform
   - Render views/analytics.ejs

4. Create views/analytics.ejs:
   - Summary cards: total likes, total views, total reach across all platforms
   - Per-platform breakdown table: posts count, avg likes, avg views
   - Recent posts list with engagement numbers per platform
   - "Refresh Stats" button → POST /analytics/sync

5. Update views/layouts/main.ejs sidebar to highlight the active page
   using a local variable passed from each route: res.locals.activePage = 'dashboard'

All views use Tailwind CSS from CDN only. No build step. Keep JS in public/js/app.js.
```

---

## Phase 9 — Platform OAuth Connections

```
You are continuing to build the "social-poster" Express + EJS app.

TASK: Build OAuth flows for all 4 platforms.
All callbacks redirect back to EJS pages — no JSON responses needed here.

Create src/routes/platforms.js

GET /platforms
- Fetch all platform_connections for req.user.id
- Render views/platforms.ejs with connection status per platform

Each platform needs:
  GET /platforms/:platform/connect   → redirect to platform OAuth URL
  GET /platforms/:platform/callback  → exchange code, save token, redirect to /platforms

--- Meta (Instagram + Facebook) ---
OAuth URL: https://www.facebook.com/v18.0/dialog/oauth
Scopes: pages_show_list, pages_read_engagement, pages_manage_posts,
        instagram_basic, instagram_content_publish, instagram_manage_insights
Exchange at: https://graph.facebook.com/v18.0/oauth/access_token
Get long-lived token: /oauth/access_token?grant_type=fb_exchange_token
Save rows for both 'facebook' and 'instagram' (same token)
On success: flash('success', 'Facebook & Instagram connected'), redirect /platforms

--- LinkedIn ---
OAuth URL: https://www.linkedin.com/oauth/v2/authorization
Scopes: openid, profile, w_member_social, r_basicprofile
Token: POST https://www.linkedin.com/oauth/v2/accessToken
Profile: GET https://api.linkedin.com/v2/userinfo
On success: flash('success', 'LinkedIn connected'), redirect /platforms

--- YouTube (Google OAuth2) ---
OAuth URL: https://accounts.google.com/o/oauth2/v2/auth
Scopes: youtube.upload, youtube.readonly
Token: POST https://oauth2.googleapis.com/token
On success: flash('success', 'YouTube connected'), redirect /platforms

POST /platforms/:platform/disconnect
- Delete platform_connections row
- Flash success, redirect to /platforms

Create views/platforms.ejs:
- Card per platform showing: logo/name, connected status, username if connected
- "Connect" button links to /platforms/:platform/connect
- "Disconnect" form button (POST with method-override) for connected platforms

Use short-lived JWT signed with SESSION_SECRET as OAuth state param (CSRF protection).
Verify state on callback before proceeding.
```

---

## Phase 10 — Deployment

```
You are finalizing the social-poster app for deployment.
It is a SINGLE unified Express + EJS app — one Railway service handles everything.

TASK: Prepare for deployment to Railway.

1. Add to package.json:
   - "start": "node app.js"
   - "engines": { "node": ">=20.0.0" }

2. Create railway.toml:
   [build]
   builder = "nixpacks"
   [deploy]
   startCommand = "npm run db:migrate && npm start"
   healthcheckPath = "/health"

3. Create .env.example with all variable names (no values) and a comment
   describing each one.

4. Create .gitignore — include: .env, node_modules/, /tmp/uploads/, *.log

5. Update session config for production in app.js:
   - cookie: { secure: process.env.NODE_ENV === 'production', httpOnly: true, maxAge: 7 days }
   - trust proxy: 1 (Railway sits behind a proxy)

6. Update Cloudinary temp upload path to use os.tmpdir() instead of hardcoded /tmp
   so it works cross-platform.

7. Update all OAuth redirect URIs in .env.example to use APP_URL variable:
   META_REDIRECT_URI=${APP_URL}/platforms/meta/callback
   (same pattern for LinkedIn and YouTube)

8. Create README.md with:
   - Local setup: docker-compose up -d → npm run db:migrate → node src/db/seed.js → npm start
   - All env variables with descriptions
   - How to get API keys for each platform
   - Railway deploy steps

Deploy checklist:
[ ] Railway project created, PostgreSQL plugin added
[ ] All env vars set in Railway dashboard (including APP_URL = your Railway URL)
[ ] db:migrate runs on deploy (via startCommand)
[ ] Seed script run once manually after first deploy (railway run node src/db/seed.js)
[ ] OAuth redirect URIs updated in Meta, Google, LinkedIn dashboards to Railway URL
[ ] Health endpoint returns 200 at /health
```

---

## Quick Reference — External API Docs

| Platform | Dashboard | API Docs |
|---|---|---|
| Instagram + Facebook | developers.facebook.com/apps | developers.facebook.com/docs/graph-api |
| LinkedIn | developer.linkedin.com | learn.microsoft.com/en-us/linkedin |
| YouTube | console.cloud.google.com | developers.google.com/youtube/v3 |
| Cloudinary | cloudinary.com/console | cloudinary.com/documentation |
| Anthropic | console.anthropic.com | docs.anthropic.com |

---

*Generated architecture document — social-poster v1.0*
