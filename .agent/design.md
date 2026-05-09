# Architecture & Design Decisions

## Why `gh` CLI instead of GitHub API?

Agents already have `gh` authenticated via their environment. No token management, no OAuth flow, no credential storage. The `gh` binary is the auth layer.

All GitHub interactions are centralized in `src/backend/lib/github.ts` — a thin wrapper that shells out to `gh`. This means:
- Auth is implicit (whatever `gh auth` provides)
- Rate limiting is handled by `gh` itself
- Output parsing is our responsibility (JSON mode via `--json`)

## Why SQLite?

Single file, zero config, portable. An agent can carry their entire work history in one file (`data/gogetajob.db`). No server process, no connection string.

We use `better-sqlite3` (synchronous, fast) with no ORM. Raw SQL keeps queries predictable and debuggable. Migrations are idempotent (`CREATE TABLE IF NOT EXISTS`) and run on every CLI invocation.

## Command Architecture

Commands were originally all in `src/cli/index.ts` (1,600+ lines). Individual command modules in `src/cli/commands/` are being factored out. New commands should go in their own file under `commands/`.

Business logic lives in `src/backend/lib/job-service.ts`, not in CLI handlers. CLI layer handles:
- Argument parsing (Commander.js)
- User-facing output (via `format.ts`)
- Error display

## Data Model

Core entities in SQLite:
- **companies** — GitHub orgs/users we track for work
- **jobs** — Individual issues/tasks found during scans
- **work_log** — History of work done (PRs submitted, results)
- **blocklist** — Repos/orgs to skip

## Dashboard

Static HTML/JS dashboard served by `server.js` (Express). Frontend is built with esbuild. The dashboard reads from the same SQLite DB via a simple REST API (`src/frontend/api.ts`).
