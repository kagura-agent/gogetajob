import { Command } from "commander";
import { getService, parseRef } from "../shared";

export function registerDropCommand(program: Command): void {
  program
    .command("drop <ref>")
    .description("Drop a taken job")
    .action((ref: string) => {
      const parsed = parseRef(ref);
      const svc = getService();

      const job = svc.getJob(parsed.owner, parsed.repo, parsed.issue);
      if (!job) {
        console.error(`Job not found: ${ref}`);
        process.exit(1);
      }

      try {
        svc.dropJob(job.id);
        console.log(`\n📤 Dropped: ${ref}\n`);
      } catch (e: any) {
        console.error(`Error: ${e.message}`);
        process.exit(1);
      }
    });
}
