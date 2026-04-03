# Workloop Overview

The `workloop` workflow is a FlowForge YAML workflow that orchestrates the full contribution cycle.

## Nodes

### followup (start node)

Run `gogetajob sync` to check all submitted PRs. For each PR with new activity:

- Distinguish human reviews from bot reviews (e.g., CodeRabbit)
- Priority: human feedback > CI failures > bot nitpicks
- For closed PRs: read the close reason; if someone else's fix was better, study it and write field notes

**Branches:**
1. Has review/CI issues → `handle_feedback`
2. All clear → `find_work`

### handle_feedback

Address PR feedback:
1. Read review comments, understand requirements
2. Modify code (via Claude Code sub-agent)
3. **Local test** (mandatory): run tests, check mock sync, `git diff --stat`
4. Commit, push, reply to reviewer

Terminal node — workflow ends after handling feedback.

### find_work

Scan for available work:
1. `gogetajob scan --all` (all tracked repos)
2. `gogetajob feed` to browse
3. Pick highest-value issue: bugs > tests > docs > features
4. Verify no competing PRs: `gh pr list --repo <repo> --search "<keywords>"`

Tips:
- Prefer repos with existing field notes
- Check maintainer merge patterns (internal-only repos = low ROI)
- Security issues: batch related fixes together

**Branches:**
1. Found a good issue → `study`
2. Nothing suitable → `reflect`

### study

Deep research before implementation:
1. **Read field notes** (`knowledge-base/projects/<repo>.md`) — mandatory
2. **Search cross-project knowledge** via memex
3. **Learn maintainer patterns** from field notes or recent merged PRs
4. Read CONTRIBUTING.md, understand code structure
5. Confirm root cause, check recent commits for existing fixes
6. **Pre-PR 5 questions** (all must pass):
   - Single problem per PR?
   - No competing PR?
   - Read contribution guide?
   - Can verify the fix?
   - Open PRs ≤ 3?

**Branches:**
1. Issue is viable, plan clear → `implement`
2. Not suitable (upstream issue, competitor, too complex) → `find_work`

### implement

Execute the plan:
1. Delegate code work to Claude Code via `acpx --approve-all claude exec`
2. Task must include: issue context, reviewer feedback, architecture info, maintainer prefs
3. Task must end with verification instructions (test, mock sync, diff check)
4. Review Claude Code's commits after completion
5. **Pre-push self-check**: `git diff --stat`, interface changes → grep mock sync, run tests

Continues to → `submit`

### submit

Create the PR:
1. Push branch to fork
2. Create PR with clear title, description (what/why/how-tested)
3. Link issue (`Closes #XX`)
4. Record with `gogetajob import`

Continues to → `verify`

### verify

Post-submission checks (wait 3-5 min first):
1. CI passing?
2. Automated reviews?
3. If issues found, address immediately

**Branches:**
1. All clear → `reflect`
2. Issues found → `implement`

### reflect

End-of-round reflection:
1. **Update field notes** (mandatory) — add PR result, maintainer style, CI notes, lessons
2. **Distill insights**: project-level → field notes, cross-project → memex cards, behavioral → beliefs-candidates.md
3. **Tool check**: any bugs in gogetajob/flowforge/gh? File issues or fix

Continues to → `done`

### done

Record to daily memory. Report results. Terminal node.
