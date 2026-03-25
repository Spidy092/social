# Approved Packages

Only install packages from this list. Ask the user before adding anything else.

## Production dependencies
- express
- ejs
- express-ejs-layouts
- pg
- dotenv
- helmet
- express-session
- connect-pg-simple
- bcryptjs
- multer
- node-cron
- uuid
- cloudinary
- @anthropic-ai/sdk
- axios
- connect-flash
- method-override

## Dev dependencies
- nodemon

## Explicitly NOT allowed (don't suggest these)
- react, react-dom, vite, webpack, parcel    ← no frontend build tools
- jsonwebtoken, passport                     ← using express-session instead
- redis, bull, bullmq                        ← using node-cron instead
- mongoose                                   ← using pg (PostgreSQL) directly
- sequelize, prisma, typeorm                 ← raw pg queries only
- tailwindcss (npm)                          ← using CDN in EJS layout
- lodash, moment, date-fns                   ← use built-in JS
