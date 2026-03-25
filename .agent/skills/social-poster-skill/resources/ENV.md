# Environment Variables Reference

## App
PORT=3000
APP_URL=http://localhost:3000          # Production: your Railway URL

## Database
DATABASE_URL=postgresql://user:password@localhost:5432/socialposter

## Session
SESSION_SECRET=long_random_string_here_min_32_chars

## Admin user (used by seed script)
ADMIN_EMAIL=admin@yourcompany.com
ADMIN_PASSWORD=changeme123

## Cloudinary (get from cloudinary.com/console)
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

## Anthropic (get from console.anthropic.com)
ANTHROPIC_API_KEY=

## Meta — covers both Instagram and Facebook (get from developers.facebook.com/apps)
META_APP_ID=
META_APP_SECRET=
META_REDIRECT_URI=http://localhost:3000/platforms/meta/callback

## LinkedIn (get from developer.linkedin.com)
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
LINKEDIN_REDIRECT_URI=http://localhost:3000/platforms/linkedin/callback

## YouTube / Google (get from console.cloud.google.com)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/platforms/youtube/callback

## NODE_ENV
NODE_ENV=development   # set to 'production' on Railway
