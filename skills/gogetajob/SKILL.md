---
name: gogetajob
description: "Open-source contribution workflow — find GitHub issues, implement fixes, submit PRs, track results. Use when: (1) starting a work loop or contribution cycle (打工, contribute, work on issues), (2) scanning repos for available work, (3) submitting or following up on PRs, (4) syncing PR statuses and handling review feedback, (5) checking work stats or history. Triggers on: 打工, 干活, find work, contribute, open source, scan issues, submit PR, work loop, gogetajob. NOT for: simple one-off code edits, reading code, or tasks unrelated to open-source contribution."
---

# GoGetAJob — Open Source Contribution Workflow

Find GitHub issues, implement fixes, submit PRs, and track everything.

## Prerequisites

### Required

- **FlowForge skill** (workflow engine): `clawhub install agent-flowforge`
- **`gh` CLI** (authenticated): `gh auth status`
- **`git`** configured with your identity
- **`claude` CLI** (Claude Code): `claude --version`

### Optional

- **GoGetAJob CLI** for stats/sync: `npm install -g @kagura-agent/gogetajob`
  - Verify: `gogetajob --help`
  - Not required for the core work loop — FlowForge handles that

## Architecture

- **Main session** = dispatch + bookkeeping (scan, pick, submit, sync, stats)
- **Sub-agents** = actual code work (implement, fix CI, address reviews)
- **Code changes** = always via Claude Code (`acpx --approve-all claude exec`)

Never do implementation work in the main session. Always delegate to sub-agents.

## Quick Commands

| Command | What it does |
|---------|-------------|
| `gogetajob scan <owner/repo>` | Discover open issues from a repo |
| `gogetajob scan --all` | Scan all tracked repos |
| `gogetajob feed` | Browse available jobs |
| `gogetajob check <ref>` | Deep-inspect an issue before taking it |
| `gogetajob start <ref>` | Take a job — fork/clone/branch |
| `gogetajob submit <ref> --tokens N` | Push + create PR + record |
| `gogetajob followup <ref> --tokens N` | Record additional effort on existing work |
| `gogetajob sync` | Check all PR statuses, flag problems |
| `gogetajob watch` | Set up automatic sync via cron |
| `gogetajob stats` | View overall performance and ROI |
| `gogetajob history` | View work log |
| `gogetajob import <repo>` | Backfill work_log from GitHub PR history |

## The Work Loop

The full contribution cycle runs as a FlowForge workflow (`workloop`). See [references/workloop-overview.md](references/workloop-overview.md) for the complete node-by-node breakdown.

Summary:

```
followup → find_work → study → implement → submit → verify → reflect
    │           │         │                                      │
    │           └─────────┘ (no good issue? loop back)           │
    └────────── (has review feedback? handle it first) ──────────┘
```

To start: `flowforge start workloop`

## Core Rules

### 1. Code via Claude Code, not hand-written

Sub-agents delegate all code changes to Claude Code:

```bash
cd <repo> && acpx --approve-all claude exec "<task description with full context>"
```

Task descriptions must include: issue context, reviewer feedback, architecture notes, maintainer preferences from knowledge-base, and a verification suffix:

> "Before committing: 1) grep for all test files that import/mock the interfaces you changed, update their mocks. 2) Run the project's test/lint commands. 3) git diff --stat to confirm no files were missed."

Exception: one-line trivial fixes can be done manually.

### 2. Dogfood everything

After each work session, check: did gogetajob, flowforge, or any tool have bugs or friction? If yes:

- File an issue on the tool's repo
- Or fix it yourself and submit a PR
- Every round should be smoother than the last — this is compounding returns

### 3. Max 3 open PRs per repo

Before submitting a new PR, check: `gh pr list --repo <owner/repo> --author @me --state open`

If ≥ 3 open PRs exist, **stop**. Wait for existing PRs to be reviewed/merged before adding more. Flooding maintainers kills goodwill.

### 4. Accurate token tracking

Always pass real token counts from sub-agent `session_status`:

```bash
gogetajob submit <ref> --tokens <actual_count>
gogetajob followup <ref> --tokens <actual_count>
```

Never estimate. Never guess. No number → don't fill it in.

### 5. Pre-PR checklist (all must pass)

Before creating any PR:

1. Does this PR solve exactly one problem?
2. No existing fix or competing PR upstream?
3. Read CONTRIBUTING.md and recent merge patterns?
4. Can verify the fix locally (tests pass)?
5. Open PRs for this repo ≤ 3?

### 6. Knowledge accumulation

- Before working on a repo: read `knowledge-base/projects/<repo>.md` (field notes)
- After finishing: update field notes with lessons, maintainer preferences, CI quirks
- Cross-project insights → memex cards
- Behavioral patterns → beliefs-candidates.md

## Sync & Follow-up

Run `gogetajob sync` regularly (or use `gogetajob watch` for automatic cron).

When sync flags issues:

| Signal | Priority | Action |
|--------|----------|--------|
| Human review comment | High | Spawn sub-agent to address, then `followup` |
| CI failure | Medium | Spawn sub-agent to fix, then `followup` |
| Bot review (CodeRabbit etc.) | Low | Address if substantive, ignore nitpicks |
| PR closed | — | Read why. If someone else's fix was better, study it |

## Issue Selection Strategy

When picking issues from `gogetajob feed`:

- **Priority**: real bugs > test coverage > docs > features
- **Prefer repos with existing field notes** (knowledge compounds)
- **High-star repos**: check for competing PRs first
- **Security/infra issues**: look for related issues to batch-fix
- **Always verify**: `git log --oneline -20 -- <relevant files>` to check if already fixed
- **Check maintainer activity**: repos that only merge internal PRs are low-ROI for external contributors
