import { Command } from "commander";
import { getService } from "../shared";
import * as gh from "../../backend/lib/github";
import { JobService } from "../../backend/lib/job-service";

export function registerStatsCommand(program: Command): void {
  program
    .command("stats")
    .description("Show overall work statistics and ROI")
    .action(() => {
      const svc = getService();

      console.log(`\n📊 Work Stats\n`);
      console.log(`  Fetching PR data from GitHub...`);

      let ghPRs: gh.GitHubPRSummary[];
      try {
        ghPRs = gh.searchAllMyPRs();
      } catch (e: any) {
        console.error(`  ⚠️  Failed to fetch from GitHub: ${e.message}`);
        console.error(`  Falling back to local database...\n`);
        const stats = svc.getEnrichedStats();
        const basicStats = svc.getStats();
        const issueStats = svc.getIssueStats();
        showLocalStats(stats, basicStats, issueStats);
        return;
      }

      let merged = 0, pending = 0, closed = 0;
      for (const pr of ghPRs) {
        const st = pr.state.toUpperCase();
        if (st === "MERGED") merged++;
        else if (st === "CLOSED") closed++;
        else pending++;
      }
      const totalPRs = ghPRs.length;
      const concluded = merged + closed;
      const mergeRate = concluded > 0 ? merged / concluded : 0;

      const basicStats = svc.getStats();
      const localStats = svc.getEnrichedStats();
      const issueStats = svc.getIssueStats();
      const totalTokens = localStats.total_tokens + issueStats.tokens;
      const tokensPerMerge = merged > 0 ? Math.round(totalTokens / merged) : 0;

      process.stdout.write("\x1b[1A\x1b[2K");

      console.log(`  📝 PR Work (source: GitHub API)`);
      console.log(`    📋 Total PRs:      ${totalPRs}`);
      console.log(`    ✅ Merged:         ${merged}`);
      console.log(`    🔵 Pending:        ${pending}`);
      console.log(`    ❌ Closed:         ${closed}`);
      console.log(`    🚫 Dropped:        ${basicStats.dropped}`);
      console.log(`    🎯 Merge rate:     ${totalPRs > 0 ? (mergeRate * 100).toFixed(0) + "%" : "N/A"}`);
      console.log();

      console.log(`  📋 Issue Work`);
      console.log(`    📋 Issues filed:   ${issueStats.total}`);
      console.log(`    🎯 Adopted:        ${issueStats.adopted}`);
      console.log(`    💬 Discussing:     ${issueStats.discussing}`);
      console.log(`    🔵 Open:           ${issueStats.open}`);
      console.log(`    🔒 Closed:         ${issueStats.closed}`);
      console.log(`    📈 Response rate:  ${issueStats.total > 0 ? ((issueStats.responded / issueStats.total) * 100).toFixed(0) + "%" : "N/A"}`);
      console.log();

      console.log(`  💰 Totals`);
      console.log(`    🔢 Total tokens:       ${totalTokens.toLocaleString()}`);
      console.log(`    📈 Tokens per merge:   ${tokensPerMerge > 0 ? tokensPerMerge.toLocaleString() : "N/A"}`);

      if (localStats.needs_action > 0) {
        console.log();
        console.log(`  ⚠️  ${localStats.needs_action} PR(s) need your attention! Run \`gogetajob sync\` for details.`);
      }

      console.log();
    });
}

function showLocalStats(
  stats: ReturnType<JobService["getEnrichedStats"]>,
  basicStats: ReturnType<JobService["getStats"]>,
  issueStats: ReturnType<JobService["getIssueStats"]>,
): void {
  console.log(`  📝 PR Work (source: local DB)`);
  console.log(`    📋 Total PRs:      ${stats.total_done}`);
  console.log(`    ✅ Merged:         ${stats.merged}`);
  console.log(`    🔵 Pending:        ${stats.pending}`);
  console.log(`    ❌ Closed:         ${stats.closed}`);
  console.log(`    🚫 Dropped:        ${basicStats.dropped}`);
  console.log(`    🎯 Merge rate:     ${stats.total_done > 0 ? (stats.merge_rate * 100).toFixed(0) + "%" : "N/A"}`);
  console.log();

  console.log(`  📋 Issue Work`);
  console.log(`    📋 Issues filed:   ${issueStats.total}`);
  console.log(`    🎯 Adopted:        ${issueStats.adopted}`);
  console.log(`    💬 Discussing:     ${issueStats.discussing}`);
  console.log(`    🔵 Open:           ${issueStats.open}`);
  console.log(`    🔒 Closed:         ${issueStats.closed}`);
  console.log(`    📈 Response rate:  ${issueStats.total > 0 ? ((issueStats.responded / issueStats.total) * 100).toFixed(0) + "%" : "N/A"}`);
  console.log();

  console.log(`  💰 Totals`);
  console.log(`    🔢 Total tokens:       ${(stats.total_tokens + issueStats.tokens).toLocaleString()}`);
  console.log(`    📈 Tokens per merge:   ${stats.tokens_per_merge > 0 ? stats.tokens_per_merge.toLocaleString() : "N/A"}`);

  if (stats.needs_action > 0) {
    console.log();
    console.log(`  ⚠️  ${stats.needs_action} PR(s) need your attention! Run \`gogetajob sync\` for details.`);
  }

  console.log();
}
