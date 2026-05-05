import { Command } from "commander";
import path from "path";
import { getService, parseRef } from "../shared";
import * as gh from "../../backend/lib/github";
import { isBlocked, getBlockReason } from "../../backend/lib/blocklist";

/**
 * Pre-submit safety checks based on PR-superseded lessons.
 * These are warnings (non-blocking) to flag likely issues before creating a PR.
 * See wiki/cards/pr-superseded-lessons.md for full context.
 */
function runPreSubmitChecks(owner: string, repo: string, issue: number, repoDir: string): void {
  const { execSync } = require("child_process");
  const warnings: string[] = [];

  // CHECK 1: Competing PRs for the same issue
  try {
    const competing = execSync(
      `gh pr list --repo ${owner}/${repo} --search "fixes #${issue} OR closes #${issue} OR resolves #${issue}" --state open --json number,author --jq '[.[] | select(.author.login != "kagura-agent")] | length'`,
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    ).trim();
    if (parseInt(competing || "0") > 0) {
      warnings.push(`\u26a0\ufe0f  COMPETING_PR: ${competing} other open PR(s) targeting issue #${issue}. Check if maintainer or others already have a fix.`);
    }
  } catch { /* gh unavailable or network issue — skip */ }

  // CHECK 2: Maintainer activity on the issue (recent comments)
  try {
    const recentComments = execSync(
      `gh api repos/${owner}/${repo}/issues/${issue}/comments --jq '[.[] | select(.author_association == "OWNER" or .author_association == "MEMBER" or .author_association == "COLLABORATOR")] | last | .body // ""'`,
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    ).trim();
    if (recentComments && (recentComments.toLowerCase().includes("investigating") || recentComments.toLowerCase().includes("working on") || recentComments.toLowerCase().includes("fix coming"))) {
      warnings.push(`\u26a0\ufe0f  MAINTAINER_ACTIVE: Maintainer indicated they're working on this. Your PR may be superseded.`);
    }
  } catch { /* skip */ }

  // CHECK 3: Fix already in main? Check if issue is referenced in recent commits
  try {
    execSync(`git fetch upstream main 2>/dev/null || git fetch origin main 2>/dev/null`, { cwd: repoDir, stdio: ["pipe", "pipe", "pipe"] });
    const mainRef = execSync(
      `git log upstream/main --oneline -20 2>/dev/null || git log origin/main --oneline -20 2>/dev/null`,
      { cwd: repoDir, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    ).trim();
    if (mainRef.includes(`#${issue}`)) {
      warnings.push(`\u26a0\ufe0f  ALREADY_IN_MAIN: Issue #${issue} referenced in recent main commits. It may already be fixed.`);
    }
  } catch { /* skip */ }

  // CHECK 4: External merge gate — are external PRs being merged?
  try {
    const mergedPRs = execSync(
      `gh pr list --repo ${owner}/${repo} --state merged --limit 15 --json author --jq '[.[] | select(.author.login != "${owner}")] | length'`,
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    ).trim();
    if (parseInt(mergedPRs || "0") === 0) {
      warnings.push(`\u26a0\ufe0f  MERGE_GATE_CLOSED: No external PRs merged in recent history. This repo may not accept outside contributions.`);
    }
  } catch { /* skip */ }

  if (warnings.length > 0) {
    console.log(`\n\ud83d\udd0d Pre-submit checks (from PR-superseded lessons):\n`);
    for (const w of warnings) {
      console.log(`   ${w}`);
    }
    console.log(`\n   Proceeding anyway \u2014 these are warnings, not blockers.\n`);
  }
}

export function registerSubmitCommand(program: Command): void {
  program
    .command("submit <ref>")
    .description("Push changes + create PR + record completion (format: owner/repo#issue_number)")
    .option("--title <text>", "PR title (default: auto from job title)")
    .option("--tokens <count>", "tokens consumed")
    .option("--notes <text>", "completion notes")
    .option("--dir <path>", "work directory", "~/repos/forks")
    .option("--skip-checks", "skip pre-submit safety checks")
    .action((ref: string, opts: any) => {
      const parsed = parseRef(ref);
      const svc = getService();

      if (isBlocked(parsed.owner, parsed.repo)) {
        const reason = getBlockReason(parsed.owner, parsed.repo);
        console.error(`\n⛔ ${parsed.owner}/${parsed.repo} is blocklisted${reason ? `: ${reason}` : ""}\n`);
        process.exit(1);
      }

      // Run pre-submit safety checks (non-blocking warnings)
      if (!opts.skipChecks) {
        const repoDir = path.join(opts.dir, parsed.repo);
        runPreSubmitChecks(parsed.owner, parsed.repo, parsed.issue, repoDir);
      }

      const job = svc.getJob(parsed.owner, parsed.repo, parsed.issue);
      if (!job) {
        console.error(`Job not found: ${ref}`);
        process.exit(1);
      }

      const repoDir = path.join(opts.dir, parsed.repo);
      const { existsSync } = require("fs");
      if (!existsSync(path.join(repoDir, ".git"))) {
        console.error(`❌ No repo found at ${repoDir}. Did you run \`gogetajob start ${ref}\` first?`);
        process.exit(1);
      }

      console.log(`\n📤 Submitting work for ${ref}...\n`);

      const { execSync: exec } = require("child_process");
      const status = exec("git status --porcelain", { cwd: repoDir, encoding: "utf-8" }).trim();
      if (status) {
        const commitTitle = opts.title || `fix: ${job.title}`;
        try {
          exec("git add -A", { cwd: repoDir, encoding: "utf-8" });
          exec(`git commit -m "${commitTitle.replace(/"/g, '\\"')}\n\nFixes ${parsed.owner}/${parsed.repo}#${parsed.issue}"`, {
            cwd: repoDir,
            encoding: "utf-8",
          });
          console.log(`  ✅ Changes committed`);
        } catch (commitErr: any) {
          const stderr = commitErr.stderr || commitErr.message || "";
          if (stderr.includes("pre-commit") || stderr.includes("hook") || stderr.includes("husky") || stderr.includes("lint") || stderr.includes("eslint") || stderr.includes("prettier")) {
            console.error(`\n  ❌ Commit failed — pre-commit hook rejected your changes.`);
            console.error(`     Likely cause: lint or format errors.`);
            console.error(`     Fix the issues in ${repoDir}, then run:`);
            console.error(`     gogetajob submit ${ref}\n`);
          } else {
            console.error(`\n  ❌ Commit failed: ${stderr.split("\n")[0]}`);
            console.error(`     Fix the issue, then run: gogetajob submit ${ref}\n`);
          }
          process.exit(1);
        }
      } else {
        let ahead: string | null = null;
        try {
          ahead = exec("git rev-list --count @{u}..HEAD", { cwd: repoDir, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
        } catch {
          // No upstream tracking branch — fall through to commit count check
        }

        if (ahead !== null) {
          if (ahead === "0") {
            console.error(`  ❌ No changes to submit. Make some changes first!`);
            process.exit(1);
          }
          console.log(`  ℹ️  No uncommitted changes — using ${ahead} existing commit(s)`);
        } else {
          // No upstream set — check if there are any commits at all
          let commitCount = 0;
          try {
            commitCount = parseInt(exec("git rev-list --count HEAD", { cwd: repoDir, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim()) || 0;
          } catch {
            // git failed entirely — assume there are commits and let push sort it out
          }
          if (commitCount === 0) {
            console.error(`  ❌ No changes to submit. Make some changes first!`);
            process.exit(1);
          }
          console.log(`  ℹ️  No uncommitted changes — using existing commits`);
        }
      }

      const prTitle = opts.title || `fix: ${job.title}`;
      let prBody = `Fixes #${parsed.issue}\n\n${opts.notes || "Automated PR via GoGetAJob"}`;

      // New repo: auto-append AI disclosure to PR body
      let disclosureAppended = false;
      try {
        const { execSync: execCheck } = require("child_process");
        const mergedCount = execCheck(
          `gh pr list --repo ${parsed.owner}/${parsed.repo} --author=kagura-agent --state=merged --json number --jq 'length'`,
          { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
        ).trim();
        if (parseInt(mergedCount || "0") === 0) {
          const DISCLOSURE = `\n\n---\n\n🤖 **Disclosure:** This PR was authored by [Kagura](https://github.com/kagura-agent), an AI agent. Open source contribution is one of the things I do — you can see my work history [here](https://github.com/kagura-agent/github-contribution). If you'd prefer not to receive AI-authored PRs, just let me know and I'll stop — no hard feelings.`;
          if (!prBody.includes("Disclosure:")) {
            prBody += DISCLOSURE;
            disclosureAppended = true;
          }
        }
      } catch {
        // gh command failed — skip (network issues etc)
      }

      try {
        if (disclosureAppended) {
          console.log(`  🤖 New repo detected — AI disclosure auto-appended to PR body`);
        }
        const prUrl = gh.pushAndCreatePR(
          repoDir,
          parsed.owner,
          parsed.repo,
          parsed.issue,
          prTitle,
          prBody,
        );

        console.log(`  ✅ PR created: ${prUrl}`);

        const prMatch = prUrl.match(/\/pull\/(\d+)/);
        const prNumber = prMatch ? parseInt(prMatch[1]) : undefined;

        try {
          svc.completeJob(job.id, {
            pr_number: prNumber,
            pr_url: prUrl,
            tokens_used: opts.tokens ? parseInt(opts.tokens) : undefined,
            notes: opts.notes,
          });
          console.log(`  ✅ Job recorded as done`);
        } catch (e: any) {
          console.log(`  ⚠️  PR created but couldn't update work log: ${e.message}`);
        }

        console.log(`\n🎉 All done!`);
        console.log(`   PR: ${prUrl}`);
        if (opts.tokens) {
          console.log(`   Tokens: ${parseInt(opts.tokens).toLocaleString()}`);
        } else {
          console.log(`   ⚠️  No --tokens specified. For accurate tracking, read token count from sub-agent session_status.`);
        }
        console.log(`   ⏰ Run \`gogetajob sync\` periodically to track PR status and catch CI failures`);
        console.log();
      } catch (e: any) {
        const msg = e.stderr || e.message || String(e);
        if (msg.includes("already exists")) {
          console.error(`  ❌ A PR from this branch already exists.`);
        } else if (msg.includes("permission") || msg.includes("403")) {
          console.error(`  ❌ Permission denied. Check your GitHub auth.`);
        } else {
          console.error(`  ❌ Failed to push/create PR: ${msg.split("\n")[0]}`);
        }
        process.exit(1);
      }
    });
}
