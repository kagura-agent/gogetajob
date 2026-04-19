import { Command } from "commander";
import { startWatch, stopWatch, showStatus } from "../watch";

export function registerWatchCommand(program: Command): void {
  program
    .command("watch")
    .description("Manage periodic sync via system crontab")
    .option("--every <interval>", "sync interval (e.g., 4h, 6h, 30m)", "4h")
    .option("--stop", "remove the crontab entry and stop watching")
    .option("--status", "show if watching is active and last sync result")
    .action((opts: any) => {
      if (opts.status) {
        showStatus();
      } else if (opts.stop) {
        stopWatch();
      } else {
        startWatch(opts.every);
      }
    });
}
