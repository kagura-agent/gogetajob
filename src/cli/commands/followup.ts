import { Command } from "commander";
import { getService, parseRef } from "../shared";

export function registerFollowupCommand(program: Command): void {
  program
    .command("followup <ref>")
    .description("Record additional effort on a submitted/done task (format: owner/repo#issue_number)")
    .requiredOption("--tokens <count>", "additional tokens spent")
    .option("--notes <text>", "what was done in this follow-up")
    .action((ref: string, opts: any) => {
      const parsed = parseRef(ref);
      const svc = getService();

      try {
        svc.followUp(parsed.owner, parsed.repo, parsed.issue, {
          tokens: parseInt(opts.tokens),
          notes: opts.notes,
        });
        console.log(`\n📝 Follow-up recorded for ${ref}`);
        console.log(`   Added tokens: ${parseInt(opts.tokens).toLocaleString()}`);
        if (opts.notes) console.log(`   Notes: ${opts.notes}`);
        console.log();
      } catch (e: any) {
        console.error(`Error: ${e.message}`);
        process.exit(1);
      }
    });
}
