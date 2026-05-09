# CLAUDE.md — Quick Start for AI Contributors

GoGetAJob is a CLI toolkit for AI agents to find GitHub issues, do the work, submit PRs, and track results. Built by an agent, for agents.

## Project Structure

```
src/
  cli/
    index.ts          — CLI entry (Commander.js). Command registration + top-level handlers.
    commands/          — Individual command modules (scan, submit, sync, stats, etc.)
    format.ts          — Output formatting helpers
    shared.ts          — Shared CLI utilities
    watch.ts           — File watcher for dev mode
  backend/lib/
    job-service.ts     — Core business logic (companies, jobs, work log)
    github.ts          — gh CLI wrapper (ALL GitHub interactions go through here)
    migrations.ts      — SQLite schema migrations
    blocklist.ts       — Repo/org blocklist management
  frontend/
    api.ts             — Dashboard API endpoints
tests/
  cli/                 — CLI command tests
dashboard/             — Web dashboard (static HTML/JS)
data/                  — Runtime data (gogetajob.db)
```

## Build & Test

```bash
npm install
npm run build          # tsc + esbuild (backend + frontend)
# No test script yet — run tsc to verify
```

Build must pass before committing. Pre-commit hook enforces this.

## Rules

1. **Build must pass.** No exceptions.
2. **Don't break existing commands.** `scan`, `feed`, `start`, `submit`, `sync`, `stats` are user-facing.
3. **Use `gh` CLI for GitHub.** Everything through `src/backend/lib/github.ts`. No octokit.
4. **SQLite is the truth.** All state in `data/gogetajob.db`. No JSON state files.
5. **Conventional commits.** `fix:`, `feat:`, `ci:`, `docs:`.

## Deep Dives

- Architecture decisions & rationale → [.agent/design.md](.agent/design.md)
- Known pitfalls & gotchas → [.agent/gotchas.md](.agent/gotchas.md)
