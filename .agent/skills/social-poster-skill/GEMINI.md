# Antigravity Project Rules — social-poster

## Stack (non-negotiable)
- Express + EJS only. No React, no Vite, no frontend build tools.
- Session auth (express-session). No JWT.
- Tailwind CSS via CDN. No npm install for Tailwind.
- Vanilla JS in public/js/app.js. No frontend frameworks.
- node-cron for scheduling. No Redis, no Bull.
- Raw pg queries. No ORM.

## Code style
- Use async/await. No callbacks or .then() chains.
- Every async route must have try/catch. No unhandled promise rejections.
- Use process.env.* for all secrets. No hardcoded values.
- Use os.tmpdir() for temp file paths. Not '/tmp'.

## Agent behaviour
- Before writing any code, read .agent/skills/social-poster/SKILL.md fully.
- One phase at a time. Do not jump ahead.
- After each phase, output a numbered test checklist.
- If a package is needed that isn't in PACKAGES.md, ask first.
- Never modify the database schema without asking.
- When fixing bugs, explain the root cause before writing code.

## File naming
- Routes: src/routes/*.js (lowercase, singular: posts.js not post.js)
- Services: src/services/*.js
- Views: views/*.ejs (lowercase, matching the route name)
- Use camelCase for JS variables, snake_case for DB columns.
