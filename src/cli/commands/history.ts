import { Command } from "commander";
import { getService } from "../shared";
import { formatWorkEntry } from "../format";

export function registerHistoryCommand(program: Command): void {
  program
    .command("history")
    .description("View work history")
    .option("--repo <owner/repo>", "filter by repo")
    .option("--status <status>", "filter: taken, done, dropped")
    .option("--type <type>", "filter: pr, issue")
    .action((opts: any) => {
      const svc = getService();
      const entries = svc.listWorkHistory({
        repo: opts.repo,
        status: opts.status,
        workType: opts.type,
      });

      if (entries.length === 0) {
        console.log("\nNo work history yet. Take a job with `gogetajob take`!\n");
        return;
      }

      const stats = svc.getStats();
      console.log(`\n📊 Work History (${entries.length} entries)`);
      console.log(`   ✅ ${stats.done} done | 🔵 ${stats.taken} active | ❌ ${stats.dropped} dropped | 🔢 ${stats.total_tokens} tokens total\n`);

      entries.forEach((entry) => {
        console.log(formatWorkEntry(entry));
        console.log();
      });
    });
}
