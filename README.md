# Social Poster

An internal tool for posting to Instagram, Facebook, LinkedIn, and YouTube from a single interface.
Built with Express, EJS, PostgreSQL, and Cloudinary.

---

## Local Development

### Prerequisites
- Node.js >= 20
- Docker & Docker Compose (for PostgreSQL)

### Setup

```bash
# 1. Clone the repo
git clone <your-repo-url>
cd social-poster

# 2. Copy and fill in environment variables
cp .env.example .env
# Edit .env with your actual credentials

# 3. Start PostgreSQL
docker-compose up -d

# 4. Run database migrations
npm run db:migrate

# 5. Seed the admin user (run once)
node src/db/seed.js

# 6. Start the dev server
npm start
```

Visit [http://localhost:3000](http://localhost:3000) — you'll be redirected to `/login`.

> **Note:** OAuth connections for Meta, LinkedIn, and YouTube require a public HTTPS URL.
> Connect platforms after deploying to Railway.

---


## EC2 one-shot deployment

For a single-server deployment with Node.js, PostgreSQL, Nginx, PM2, and Let's Encrypt on the same EC2 instance:

```bash
cp .env.example .env
# fill in your application secrets in .env first
DOMAIN=app.example.com \
LETSENCRYPT_EMAIL=you@example.com \
DB_PASSWORD='choose-a-strong-password' \
sudo -E ./setup.sh
```

The script supports Ubuntu/Debian and Amazon Linux 2023. It installs system packages, creates the local PostgreSQL database, updates the production `DATABASE_URL`, runs migrations, starts the app with PM2, configures Nginx, and obtains HTTPS when `ENABLE_SSL=true`.

Before running it with HTTPS enabled, point your domain's DNS A record at the EC2 public IP and allow inbound ports `22`, `80`, and `443` in the EC2 security group.

## Deploying to Railway

### 1. Create a Railway project

1. Go to [railway.app](https://railway.app) and create a new project
2. Add a **PostgreSQL** plugin to the project
3. Deploy this repo as a new service

### 2. Set environment variables

In your Railway service settings, add every variable from `.env.example`:

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Copy from the PostgreSQL plugin |
| `SESSION_SECRET` | Generate a random 32+ char string |
| `NODE_ENV` | Set to `production` |
| `APP_URL` | Your Railway public URL, e.g. `https://social-poster.up.railway.app` |
| `CLOUDINARY_*` | From [cloudinary.com/console](https://cloudinary.com/console) |
| `OPENROUTER_API_KEY` | From [openrouter.ai](https://openrouter.ai) |
| `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI` | From [developers.facebook.com](https://developers.facebook.com) |
| `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_REDIRECT_URI` | From [developer.linkedin.com](https://developer.linkedin.com) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | From [console.cloud.google.com](https://console.cloud.google.com) |

### 3. Set OAuth redirect URIs

After your first deploy, update the redirect URIs in each platform's developer dashboard to use your Railway URL:

| Platform | Redirect URI |
|---|---|
| Meta (Instagram/Facebook) | `https://YOUR_URL/platforms/meta/callback` |
| LinkedIn | `https://YOUR_URL/platforms/linkedin/callback` |
| YouTube (Google) | `https://YOUR_URL/platforms/youtube/callback` |

### 4. First deploy checklist

```bash
# After first deploy, seed the admin user via Railway CLI
railway run node src/db/seed.js
```

- [ ] Railway deploy logs show "migration complete" and "scheduler started"
- [ ] `GET /health` returns `{ "status": "ok" }`
- [ ] Login works with seeded admin credentials
- [ ] Connect each platform via OAuth on the `/platforms` page
- [ ] Upload a test post and publish

---

## Architecture

```
app.js            — Express entry point
src/
  routes/         — auth, dashboard, posts, platforms, captions, analytics
  services/       — cloudinary, openrouter, analyticsSync, platforms/
  scheduler/      — postScheduler.js (cron every 60s)
  middleware/     — auth.js (requireLogin), upload.js (multer)
  db/             — migrations, seed
views/            — EJS templates (layouts/main.ejs as shell)
public/           — CSS + client-side JS
docker-compose.yml
railway.toml
```

---

## Tech Stack

- **Runtime:** Node.js + Express
- **Views:** EJS + express-ejs-layouts + Tailwind CSS (CDN)
- **Database:** PostgreSQL (via `pg`)
- **Auth:** express-session + connect-pg-simple
- **File uploads:** Multer → Cloudinary
- **Scheduling:** node-cron
- **AI captions:** OpenRouter API
