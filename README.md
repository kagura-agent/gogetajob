# GoGetAJob

AI Agent Job Market — find open-source work, do it, track results.

## Quick Start

```bash
npm install -g @kagura-agent/gogetajob   # or: npm install && npm run build && npm link

gogetajob scan <owner/repo>    # discover issues
gogetajob feed                 # browse available jobs
gogetajob start <ref>          # take a job + setup workspace
gogetajob submit <ref>         # push + create PR + record
gogetajob sync                 # check PR/issue statuses
gogetajob stats                # view overall performance
```

## Agent Workflow

GoGetAJob is designed for AI agents. The recommended workflow ensures accurate token tracking and clean task isolation.

### The Golden Rule

**Main session = dispatch + bookkeeping. Sub-agents = actual work.**

Never do the work in your main session. Always spawn a sub-agent.

### Standard Flow

```
1. scan/feed/check     → Find and evaluate work (main session)
2. start <ref>         → Take the job, fork/clone/branch (main session)
3. spawn sub-agent     → Do the actual work in isolated session
4. read session_status → Get real token count from sub-agent
5. submit --tokens N   → Create PR + record with accurate tokens (main session)
```

### Follow-up Flow

```
1. sync                → Discover CI failures, review comments (main session)
2. spawn sub-agent     → Fix the issue in isolated session
3. read session_status → Get follow-up token count
4. followup --tokens N → Add tokens to original work entry (main session)
```

### Why Sub-agents?

- **Accurate tokens**: Each sub-agent has its own session_status with precise token counts
- **No pollution**: Chat tokens don't mix with work tokens
- **Clean context**: Sub-agent focuses on the task without conversation history noise
- **Real ROI**: Total cost per task = initial tokens + all follow-up tokens

### Token Tracking

The `--tokens` flag should always contain **real token counts** from sub-agent `session_status`.

- `submit --tokens 5000` → initial work cost
- `followup --tokens 2000` → follow-up effort (adds to same entry)
- Never estimate. Never guess. If you don't have the number, don't fill it in.

## Commands

| Command | Description |
|---------|-------------|
| `scan <repo>` | Discover open issues from a repo |
| `feed` | Browse available jobs |
| `info <repo>` | View company/repo profile |
| `check <ref>` | Deep-inspect an issue before taking it |
| `start <ref>` | Take a job + fork/clone/branch |
| `submit <ref>` | Push + create PR + record completion |
| `followup <ref>` | Record additional effort on existing work |
| `sync` | Check PR/issue statuses, flag problems |
| `stats` | Overall work statistics and ROI |
| `history` | View work log |
| `companies` | List known repos |
| `audit <repo>` | Analyze repo health |
| `import <repo>` | Backfill work_log from GitHub PR history |
| `discover` | Auto-discover repos worth contributing to |
| `take/done/drop` | Manual workflow helpers |

## Work Lifecycle

```
taken → submitted → done (merged)
                  → closed (PR closed)
```

- `start` → status: taken
- `submit` → status: submitted (PR created, not yet merged)
- `sync` → auto-transitions to done/closed based on PR state
- `followup` → adds tokens to submitted/done entries

## Staying on Top of Work

Submitting a PR is not the end. CI can fail, reviewers request changes, conflicts appear. **Run `sync` regularly.**

### Automatic syncing with `watch`

The easiest way to stay on top of your work is to use the built-in `watch` command, which manages a system crontab entry for you:

```bash
# Start watching — syncs every 4 hours (default)
gogetajob watch

# Custom interval
gogetajob watch --every 2h
gogetajob watch --every 30m

# Check status and last sync results
gogetajob watch --status

# Stop watching
gogetajob watch --stop
```

Sync output is logged to `data/watch.log` so you can always review what happened.

### Manual sync

You can also run sync manually at any time:

```bash
gogetajob sync
```

This will flag:
- ❌ CI failures that need fixing
- 🔴 Review comments that need responses
- ✅ PRs that got merged (auto-transitions to done)

When `sync` finds a problem, spawn a sub-agent to fix it, then record the effort:

```bash
gogetajob followup <ref> --tokens <count> --notes "fixed CI"
```

## Web Dashboard

GoGetAJob includes a React frontend and Express API server for visual job tracking.

- **Frontend**: `http://localhost:7100` — React dashboard with charts and job browser
- **API Server**: `http://localhost:9393` — Express backend serving data from SQLite

```bash
npm start   # starts the Express server (serves both API and frontend)
```

## License

MIT
