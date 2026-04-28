# SEFPOS Project Memory (Permanent)

This file is the permanent project memory for this repository.

## Project Identity

- Project name: `SEFPOS`
- Primary workspace path: `C:\sefpos`
- Primary Supabase URL: `https://orlydeyxshsdusxukhuu.supabase.co`
- Primary Supabase project ref: `orlydeyxshsdusxukhuu`

## Non-Negotiable Rules

- Always stay on this project context unless the user explicitly asks to switch.
- Never run Supabase operations against any other project ref.
- Never remove or replace the primary Supabase URL/ref for this project.
- Keep performance-first behavior for POS flows (tables, order panel, payments).
- When changing waiter/device logic, preserve hard-disable behavior for inactive/deleted users.

## Deployment / Automation Defaults

- CI workflow: `.github/workflows/ci.yml`
- Supabase migration workflow: `.github/workflows/supabase-migrations.yml`
- Dependency automation: `.github/dependabot.yml`

Required GitHub secrets for automation:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_REF` (must be `orlydeyxshsdusxukhuu`)
- `SUPABASE_DB_PASSWORD`

## Local Environment Contract

Expected keys in `.env`:

- `VITE_SUPABASE_URL=https://orlydeyxshsdusxukhuu.supabase.co`
- `VITE_SUPABASE_ANON_KEY=<present>`

## Operator Note

If Supabase MCP access fails with permission errors, reconnect/authenticate the Supabase integration with the account that owns project ref `orlydeyxshsdusxukhuu`, then continue.
