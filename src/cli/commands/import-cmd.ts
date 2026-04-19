import { Command } from "commander";
import { getService } from "../shared";
import * as gh from "../../backend/lib/github";

export function registerImportCommand(program: Command): void {
  program
    .command("import <repo>")
    .description("Backfill work_log from GitHub PR history (format: owner/repo)")
    .option("--dry-run", "show what would be imported without writing")
    .action((repoArg: string, opts: any) => {
      const [owner, repo] = repoArg.split("/");
      if (!owner || !repo) {
        console.error("Error: format should be owner/repo");
        process.exit(1);
      }

      const svc = getService();
      console.log(`\n📥 Importing PR history for ${owner}/${repo}...\n`);

      const myPRs = gh.getMyPRs(owner, repo);
      if (myPRs.length === 0) {
        console.log("  No PRs found by you in this repo.");
        console.log("  💡 If you just created a PR, GitHub may need a few seconds to index it — try again shortly.\n");
        return;
      }

      console.log(`  Found ${myPRs.length} PR(s) by ${gh.getMyLogin()}\n`);

      let imported = 0;
      let skipped = 0;

      for (const pr of myPRs) {
        if (svc.hasPRInLog(owner, repo, pr.number)) {
          skipped++;
          continue;
        }

        const icon = pr.state === "MERGED" ? "✅" :
                     pr.state === "CLOSED" ? "❌" : "🔵";
        const issueRef = pr.linkedIssueNumber ? ` (issue #${pr.linkedIssueNumber})` : "";

        if (opts.dryRun) {
          console.log(`  ${icon} Would import PR #${pr.number} — ${pr.title}${issueRef}`);
          imported++;
          continue;
        }

        svc.importPR({
          owner,
          repo,
          issueNumber: pr.linkedIssueNumber,
          prNumber: pr.number,
          prUrl: pr.url,
          prStatus: pr.state,
          notes: pr.title,
          createdAt: pr.createdAt,
          completedAt: pr.mergedAt || pr.closedAt || null,
        });

        console.log(`  ${icon} Imported PR #${pr.number} — ${pr.title}${issueRef}`);
        imported++;
      }

      console.log(`\n📊 ${opts.dryRun ? "Would import" : "Imported"}: ${imported} | Skipped (already tracked): ${skipped}\n`);
    });
}
