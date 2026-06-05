import { Command } from "commander";
import { getService } from "../shared";
import { formatJob } from "../format";

export function registerFeedCommand(program: Command): void {
  program
    .command("feed")
    .description("Browse open job opportunities")
    .option("--lang <language>", "filter by programming language")
    .option("--type <type>", "filter by type: bug, feature, docs, test, refactor")
    .option("--limit <n>", "max results", "20")
    .option("--max-size <n>", "skip repos larger than N MB")
    .option("--no-pr", "only show issues without existing PRs")
    .option("--verify", "verify issue state against GitHub API (slower but accurate)")
    .action(async (opts: any) => {
      const svc = getService();
      const jobs = svc.listJobs({
        lang: opts.lang,
        type: opts.type,
        limit: parseInt(opts.limit),
        maxSizeMB: opts.maxSize ? parseInt(opts.maxSize) : undefined,
        noPr: opts.pr === false ? true : undefined,
      });

      if (jobs.length === 0) {
        console.log("\nNo jobs found. Try `gogetajob scan <owner/repo>` to discover issues.\n");
        return;
      }

      console.log(`\n📋 Open Jobs (${jobs.length})\n`);

      // If --verify, check live state and filter out closed/stale issues
      let verifiedJobs = jobs;
      if (opts.verify) {
        const { execSync } = require("child_process");
        console.log("🔍 Verifying issue states against GitHub API...\n");
        verifiedJobs = [];
        for (const job of jobs) {
          try {
            const result = execSync(
              `gh issue view ${job.issue_number} --repo ${job.company_name} --json state -q '.state'`,
              { encoding: "utf-8", timeout: 10000, stdio: ["pipe", "pipe", "pipe"] }
            ).trim();
            if (result === "OPEN") {
              verifiedJobs.push(job);
            } else {
              console.log(`  ⚠️ #${job.issue_number} (${job.company_name}) is ${result} on GitHub — skipping (DB stale)`);
              // Update DB state
              svc.updateJobState(job.company_name!, job.issue_number, result.toLowerCase());
            }
          } catch {
            // API error — keep the job (don't filter on failure)
            verifiedJobs.push(job);
          }
        }
        if (verifiedJobs.length < jobs.length) {
          console.log(`\n  📊 Verified: ${verifiedJobs.length}/${jobs.length} still open\n`);
        }
      }

      verifiedJobs.forEach((job: any, i: number) => {
        console.log(formatJob(job, i));
        console.log();
      });
    });
}
