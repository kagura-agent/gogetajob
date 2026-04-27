import { Command } from "commander";
import {
  addToBlocklist,
  removeFromBlocklist,
  getBlocklist,
} from "../../backend/lib/blocklist";

export function registerBlocklistCommand(program: Command): void {
  const cmd = program
    .command("blocklist")
    .description("Manage repo blocklist — prevent scanning/starting/submitting to specific repos");

  cmd
    .command("add <repo>")
    .description("Add a repo to the blocklist (format: owner/repo)")
    .option("--reason <text>", "reason for blocking")
    .action((repo: string, opts: any) => {
      if (!repo.includes("/")) {
        console.error("Error: format should be owner/repo");
        process.exit(1);
      }
      addToBlocklist(repo, opts.reason);
      console.log(`\n⛔ Added ${repo} to blocklist.`);
      if (opts.reason) console.log(`   Reason: ${opts.reason}`);
      console.log();
    });

  cmd
    .command("remove <repo>")
    .description("Remove a repo from the blocklist (format: owner/repo)")
    .action((repo: string) => {
      if (!repo.includes("/")) {
        console.error("Error: format should be owner/repo");
        process.exit(1);
      }
      removeFromBlocklist(repo);
      console.log(`\n✅ Removed ${repo} from blocklist.\n`);
    });

  cmd
    .command("list", { isDefault: true })
    .description("List all blocked repos")
    .action(() => {
      const list = getBlocklist();
      if (list.length === 0) {
        console.log("\nNo repos blocked.\n");
        return;
      }
      console.log(`\n⛔ Blocked Repos (${list.length})\n`);
      for (const entry of list) {
        console.log(`  • ${entry.repo}${entry.reason ? ` — ${entry.reason}` : ""}`);
      }
      console.log();
    });
}
