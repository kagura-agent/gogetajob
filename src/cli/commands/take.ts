import { Command } from "commander";
import { getService, parseRef } from "../shared";

export function registerTakeCommand(program: Command): void {
  program
    .command("take <ref>")
    .description("Take a job (format: owner/repo#issue_number)")
    .action((ref: string) => {
      const parsed = parseRef(ref);
      const svc = getService();

      const job = svc.getJob(parsed.owner, parsed.repo, parsed.issue);
      if (!job) {
        console.error(`Job not found: ${ref}. Run \`gogetajob scan ${parsed.owner}/${parsed.repo}\` first.`);
        process.exit(1);
      }

      try {
        const logId = svc.takeJob(job.id);
        console.log(`\n✅ Taken! Work log #${logId}`);
        console.log(`   ${job.title}`);
        console.log(`   Good luck! 🍀\n`);
      } catch (e: any) {
        console.error(`Error: ${e.message}`);
        process.exit(1);
      }
    });
}
