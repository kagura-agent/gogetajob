import { Command } from "commander";
import { getService, parseRef } from "../shared";

export function registerDoneCommand(program: Command): void {
  program
    .command("done <ref>")
    .description("Mark a job as completed")
    .option("--pr <number>", "PR number")
    .option("--tokens <count>", "tokens consumed")
    .option("--notes <text>", "completion notes")
    .action((ref: string, opts: any) => {
      const parsed = parseRef(ref);
      const svc = getService();

      const job = svc.getJob(parsed.owner, parsed.repo, parsed.issue);
      if (!job) {
        console.error(`Job not found: ${ref}`);
        process.exit(1);
      }

      try {
        svc.completeJob(job.id, {
          pr_number: opts.pr ? parseInt(opts.pr) : undefined,
          pr_url: opts.pr ? `https://github.com/${parsed.owner}/${parsed.repo}/pull/${opts.pr}` : undefined,
          tokens_used: opts.tokens ? parseInt(opts.tokens) : undefined,
          notes: opts.notes,
        });
        console.log(`\n🎉 Job done!`);
        console.log(`   ${job.title}`);
        if (opts.pr) console.log(`   PR: #${opts.pr}`);
        if (opts.tokens) console.log(`   Tokens: ${parseInt(opts.tokens).toLocaleString()}`);
        console.log();
      } catch (e: any) {
        console.error(`Error: ${e.message}`);
        process.exit(1);
      }
    });
}
