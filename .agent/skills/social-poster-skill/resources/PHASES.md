# Phase Build Instructions

When the user asks to build a phase, follow the instructions below exactly.
After each phase, output a numbered test checklist.

---

## Phase 1 — Project setup + database

Install packages from PACKAGES.md. Create folder structure from SKILL.md.

Create app.js with:
- helmet, express.json(), express.urlencoded({ extended: true })
- method-override (supports _method in POST forms)
- express-session with connect-pg-simple store, SESSION_SECRET from .env
  Session cookie: httpOnly:true, secure: process.env.NODE_ENV==='production', maxAge: 7 days
  Trust proxy: 1
- connect-flash; set res.locals.success and res.locals.error from flash in middleware
- View engine: EJS; use express-ejs-layouts; default layout = 'layouts/main'
- express.static('public')
- Mount all routers (stub empty routers for now)
- GET /health → res.json({ status: 'ok', ts: new Date() })

Create views/layouts/main.ejs:
- Full HTML shell, Tailwind CDN in <head>
- Sidebar with links: Dashboard(/), Upload(/upload), Schedule(/schedule), Platforms(/platforms), Analytics(/analytics)
- Active link highlighted using activePage local variable
- <%- body %> for page content
- Flash partial included at top

Create views/partials/flash.ejs — success (green) and error (red) banners.
Create docker-compose.yml for postgres:15 on port 5432.
Create .env from ENV.md with placeholder values.
Run SQL from SCHEMA.sql as 001_initial.sql migration. Add db:migrate npm script.

Test checklist:
1. docker-compose up -d → no errors
2. npm run db:migrate → tables created
3. npm start → server starts on PORT
4. GET /health → { status: 'ok' }
5. http://localhost:3000 → renders EJS layout without crash

---

## Phase 2 — Auth

Create src/db/seed.js:
- Reads ADMIN_EMAIL, ADMIN_PASSWORD from .env
- Hashes password with bcryptjs (rounds: 12)
- Inserts or updates user in users table
- Log "Admin user created: {email}" on success

Create src/routes/auth.js:
- GET /login: if session → redirect /; else render views/auth/login.ejs (layout:false)
- POST /login: compare password, set req.session.userId, redirect / or flash error + redirect /login
- GET /logout: req.session.destroy(), redirect /login

Create views/auth/login.ejs (no layout):
- Centered card, Tailwind CDN
- Email + password fields, POST to /login
- Shows error flash if present

Create src/middleware/auth.js exporting requireLogin middleware.
Apply requireLogin to all routes in app.js EXCEPT /login, /logout, /health, /platforms/*/callback.

Test checklist:
1. node src/db/seed.js → "Admin user created"
2. Visit / → redirects to /login
3. Login with wrong password → flash error shown
4. Login with correct credentials → redirects to /
5. Visit /logout → redirects to /login

---

## Phase 3 — File upload + Cloudinary + upload/schedule views

Create src/services/cloudinary.js: uploadFile(), deleteFile() as per SKILL.md.
Create src/middleware/upload.js: multer, dest os.tmpdir(), field name 'media', max 500MB.

Create src/routes/posts.js:
- GET /upload → render views/upload.ejs
- POST /posts (upload middleware) → cloudinary upload, delete temp, insert post, flash + redirect /schedule
- GET /schedule → fetch posts joined with post_results, render views/schedule.ejs
- POST /posts/:id/delete → cloudinary delete, db delete, redirect /schedule
- POST /posts/:id/publish-now → trigger publish for single post (stub for now, complete in Phase 5)

Create views/upload.ejs:
- Tailwind form, multipart, POST /posts
- File input with JS preview (image or video) in public/js/app.js
- Caption textarea
- Platform checkboxes (instagram, facebook, linkedin, youtube) — at least one required
- Per-platform caption textarea for each checked platform
- "Generate AI Captions" button → fetch POST /captions/generate → fill textareas
- Optional datetime-local for scheduling
- Submit button

Create views/schedule.ejs:
- Table: thumbnail, caption, platforms (badges), scheduled_at, status (colour-coded badge)
- Post Now button (POST /posts/:id/publish-now)
- Delete form button (POST /posts/:id/delete with _method=DELETE)

Test checklist:
1. Visit /upload → form renders
2. Upload an image → file appears in Cloudinary console
3. Row appears in posts table with status 'draft' or 'pending'
4. Visit /schedule → post listed correctly
5. Delete post → removed from Cloudinary + DB

---

## Phase 4 — Platform posting services

Create one file per platform in src/services/ following PLATFORM_APIS.md exactly.
Each exports: postContent(connection, { mediaUrl, mediaType, caption }) → { platformPostId }

Create src/services/platforms/index.js:
- exports postToPlatform(platform, connection, postData)
- Routes to correct service based on platform string
- Wraps with callWithRefresh token retry pattern from PLATFORM_APIS.md

Key constraints (read PLATFORM_APIS.md for details):
- Instagram: poll container status before publishing — never skip
- Facebook: get Page ID first from /me/accounts
- LinkedIn: register upload → upload binary → create ugcPost
- YouTube: throw clear error if mediaType === 'image'

Test checklist (use real or sandbox credentials):
1. Call postContent directly from a test script for one platform
2. Post appears on the platform
3. platformPostId returned and logged
4. 401 triggers token refresh (test by expiring token manually)

---

## Phase 5 — Scheduler

Create src/scheduler/postScheduler.js:
```javascript
const cron = require('node-cron');
const db = require('../db');
const { postToPlatform } = require('../services/platforms');

function startScheduler() {
  cron.schedule('* * * * *', async () => {
    try {
      const { rows: posts } = await db.query(
        `SELECT * FROM posts WHERE status = 'pending' AND scheduled_at <= NOW()`
      );
      for (const post of posts) {
        await db.query(`UPDATE posts SET status = 'publishing' WHERE id = $1`, [post.id]);
        const platforms = Object.keys(post.platforms);
        const results = await Promise.allSettled(
          platforms.map(async (platform) => {
            const { rows: [conn] } = await db.query(
              `SELECT * FROM platform_connections WHERE user_id=$1 AND platform=$2`,
              [post.user_id, platform]
            );
            if (!conn) throw new Error(`No connection for ${platform}`);
            const caption = post.platforms[platform]?.caption || post.caption_original;
            const result = await postToPlatform(platform, conn, {
              mediaUrl: post.media_url, mediaType: post.media_type, caption
            });
            await db.query(
              `INSERT INTO post_results (post_id, platform, status, platform_post_id) VALUES ($1,$2,'success',$3)`,
              [post.id, platform, result.platformPostId]
            );
          })
        );
        const allOk = results.every(r => r.status === 'fulfilled');
        await db.query(`UPDATE posts SET status=$1 WHERE id=$2`, [allOk ? 'published' : 'failed', post.id]);
        // Save failed results
        for (let i = 0; i < results.length; i++) {
          if (results[i].status === 'rejected') {
            await db.query(
              `INSERT INTO post_results (post_id, platform, status, error_message) VALUES ($1,$2,'failed',$3)`,
              [post.id, platforms[i], results[i].reason?.message]
            );
          }
        }
        console.log(`[scheduler] Post ${post.id}: ${allOk ? 'published' : 'failed'}`);
      }
    } catch (err) {
      console.error('[scheduler] cron error:', err.message);
    }
  });
  console.log('[scheduler] started — checking every 60s');
}

module.exports = { startScheduler };
```

Import and call startScheduler() in app.js.

Complete POST /posts/:id/publish-now route in posts.js:
- Set status = 'publishing'
- Run same publish logic as scheduler for this single post
- Flash success/failure, redirect /schedule

Test checklist:
1. Create a post scheduled 1 minute ahead
2. Wait → confirm status changes to 'published' in DB
3. Post appears on the platform
4. POST /posts/:id/publish-now → posts immediately

---

## Phase 6 — AI captions

Create src/services/claude.js:
- Initialize Anthropic client with ANTHROPIC_API_KEY
- Export generateCaptions(originalCaption, platforms[]) → { instagram, facebook, linkedin, youtube }
- Model: claude-sonnet-4-20250514, max_tokens: 1000
- Return JSON only — strip markdown backticks before JSON.parse
- System prompt: expert social media copywriter, per-platform tone guidelines
- On API error: throw error with message 'Caption generation failed'

Create src/routes/captions.js:
- POST /captions/generate (requireLogin, JSON body)
- Validate: caption non-empty, platforms non-empty array
- Call generateCaptions()
- Return: res.json({ captions }) or res.status(503).json({ error: '...' })

Wire up the "Generate AI Captions" button in public/js/app.js:
```javascript
document.getElementById('generate-captions')?.addEventListener('click', async () => {
  const caption = document.getElementById('caption').value;
  const platforms = [...document.querySelectorAll('input[name="platforms"]:checked')].map(el => el.value);
  if (!caption || !platforms.length) return alert('Add a caption and select platforms first');
  const btn = document.getElementById('generate-captions');
  btn.textContent = 'Generating...'; btn.disabled = true;
  try {
    const res = await fetch('/captions/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caption, platforms })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    platforms.forEach(p => {
      const ta = document.getElementById(`caption-${p}`);
      if (ta && data.captions[p]) ta.value = data.captions[p];
    });
  } catch (e) { alert('Caption generation failed: ' + e.message); }
  finally { btn.textContent = 'Generate AI Captions'; btn.disabled = false; }
});
```

Test checklist:
1. POST /captions/generate with valid body → returns JSON captions for each platform
2. Each caption is appropriately styled for its platform (tone, hashtags, length)
3. Button in upload.ejs fills in per-platform textareas correctly
4. Error response on missing caption → 400

---

## Phase 7 — Dashboard view

Create src/routes/dashboard.js:
- GET / → query stats + recent 10 posts → render views/dashboard.ejs

Create views/dashboard.ejs:
- 4 stat cards: Total Posts, Published, Pending, Failed
- Recent posts table: thumbnail, caption (truncated), platform badges, status badge, time ago
- "Create New Post" button → /upload
- Platform connection status bar (connected platforms shown as green pills)
- Pass activePage: 'dashboard'

---

## Phase 8 — Analytics view

Create src/routes/analytics.js:
- GET /analytics → aggregate from analytics_snapshots → render views/analytics.ejs
- POST /analytics/sync → trigger syncAnalytics() for current user

Create src/services/analyticsSync.js:
- syncAnalytics(userId) — fetch stats from each platform API
- Upsert into analytics_snapshots (one snapshot per post_result per day)
- Schedule with node-cron at '0 2 * * *'

Create views/analytics.ejs:
- Summary cards: total likes, views, reach
- Per-platform table: posts, avg likes, avg views
- Recent posts with engagement
- "Refresh Stats" button → POST /analytics/sync

---

## Phase 9 — OAuth platform connections

Create src/routes/platforms.js following PLATFORM_APIS.md OAuth flows.

State param: use crypto.randomBytes(16).toString('hex'), store in req.session.oauthState.
Verify on callback: if mismatch → flash error, redirect /platforms.

GET /platforms → render views/platforms.ejs with connection status per platform.

Create views/platforms.ejs:
- Card per platform: name, connected status, username if connected
- "Connect" button → /platforms/:platform/connect
- "Disconnect" form (POST with _method=DELETE) for connected platforms

All callback success → flash success message → redirect /platforms
All callback errors → flash error message → redirect /platforms

---

## Phase 10 — Deployment prep

Add to package.json:
- "start": "node app.js"
- "engines": { "node": ">=20.0.0" }

Create railway.toml:
```toml
[build]
builder = "nixpacks"

[deploy]
startCommand = "npm run db:migrate && npm start"
healthcheckPath = "/health"
```

Create .gitignore: .env, node_modules/, tmp/, *.log
Create .env.example from ENV.md (keys only, no values).

Update session cookie in app.js:
- secure: process.env.NODE_ENV === 'production'
- trust proxy: app.set('trust proxy', 1)

Update Cloudinary temp path: use os.tmpdir() not hardcoded '/tmp'.

Create README.md with local setup + Railway deploy steps.

Deploy checklist:
1. Railway project created + PostgreSQL plugin added
2. All env vars set in Railway (including APP_URL = Railway URL, NODE_ENV=production)
3. First deploy: check logs for "migration complete" and "scheduler started"
4. Run seed: railway run node src/db/seed.js
5. Update OAuth redirect URIs in Meta, Google, LinkedIn dashboards to Railway URL
6. /health returns 200
7. Login works with seeded credentials
8. Connect one platform via OAuth → post a test
