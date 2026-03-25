# AGENTS.md — social-poster project rules

This file is read by Antigravity, Cursor, Claude Code, and other AI coding agents.

## Project type
Internal tool. Express + EJS monolith. No frontend/backend split.

## Never do
- Install React, Vue, Vite, webpack, or any frontend build tool
- Use JWT — this project uses express-session
- Use Redis or Bull — scheduling is done with node-cron
- Hardcode secrets or API keys
- Use an ORM — write raw SQL with the pg package
- Add packages not listed in .agent/skills/social-poster/resources/PACKAGES.md

## Always do
- Read .agent/skills/social-poster/SKILL.md before starting any task
- Wrap every async function in try/catch
- Use process.env.* for all config values
- Use os.tmpdir() for temporary file paths
- Output a test checklist after completing each phase
- Build one phase at a time

## Architecture reminder
Single unified app. One server. One Railway deploy.
Views are in views/*.ejs. Static files in public/.
No separate frontend server, no API prefix, no CORS needed.
