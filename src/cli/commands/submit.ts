import { Command } from "commander";
import path from "path";
import { getService, parseRef } from "../shared";
import * as gh from "../../backend/lib/github";
import { isBlocked, getBlockReason } from "../../backend/lib/blocklist";

export function registerSubmitCommand(program: Command): void {
  program
    .command("submit <ref>")
    .description("Push changes + create PR + record completion (format: owner/repo#issue_number)")
    .option("--title <text>", "PR title (default: auto from job title)")
    .option("--tokens <count>", "tokens consumed")
    .option("--notes <text>", "completion notes")
    .option("--dir <path>", "work directory", "~/repos/forks")
    .action((ref: string, opts: any) => {
      const parsed = parseRef(ref);
      const svc = getService();

      if (isBlocked(parsed.owner, parsed.repo)) {
        const reason = getBlockReason(parsed.owner, parsed.repo);
        console.error(`\n⛔ ${parsed.owner}/${parsed.repo} is blocklisted${reason ? `: ${reason}` : ""}\n`);
        process.exit(1);
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
