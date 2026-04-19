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
    .action((opts: any) => {
      const svc = getService();
      const jobs = svc.listJobs({
        lang: opts.lang,
        type: opts.type,
        limit: parseInt(opts.limit),
      });

      if (jobs.length === 0) {
        console.log("\nNo jobs found. Try `gogetajob scan <owner/repo>` to discover issues.\n");
        return;
      }

      console.log(`\n📋 Open Jobs (${jobs.length})\n`);
      jobs.forEach((job, i) => {
        console.log(formatJob(job, i));
        console.log();
      });
    });
}
