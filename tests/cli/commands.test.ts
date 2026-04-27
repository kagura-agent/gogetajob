import { describe, it, expect } from "vitest";
import { Command } from "commander";

import { registerFeedCommand } from "../../src/cli/commands/feed";
import { registerInfoCommand } from "../../src/cli/commands/info";
import { registerScanCommand } from "../../src/cli/commands/scan";
import { registerDiscoverCommand } from "../../src/cli/commands/discover";
import { registerCheckCommand } from "../../src/cli/commands/check";
import { registerStartCommand } from "../../src/cli/commands/start";
import { registerSubmitCommand } from "../../src/cli/commands/submit";
import { registerTakeCommand } from "../../src/cli/commands/take";
import { registerDoneCommand } from "../../src/cli/commands/done";
import { registerDropCommand } from "../../src/cli/commands/drop";
import { registerFollowupCommand } from "../../src/cli/commands/followup";
import { registerSyncCommand } from "../../src/cli/commands/sync";
import { registerStatsCommand } from "../../src/cli/commands/stats";
import { registerHistoryCommand } from "../../src/cli/commands/history";
import { registerCompaniesCommand } from "../../src/cli/commands/companies";
import { registerImportCommand } from "../../src/cli/commands/import-cmd";
import { registerAuditCommand } from "../../src/cli/commands/audit";
import { registerWatchCommand } from "../../src/cli/commands/watch";
import { registerBlocklistCommand } from "../../src/cli/commands/blocklist";

const allRegisters = [
  { fn: registerFeedCommand, name: "feed" },
  { fn: registerInfoCommand, name: "info" },
  { fn: registerScanCommand, name: "scan" },
  { fn: registerDiscoverCommand, name: "discover" },
  { fn: registerCheckCommand, name: "check" },
  { fn: registerStartCommand, name: "start" },
  { fn: registerSubmitCommand, name: "submit" },
  { fn: registerTakeCommand, name: "take" },
  { fn: registerDoneCommand, name: "done" },
  { fn: registerDropCommand, name: "drop" },
  { fn: registerFollowupCommand, name: "followup" },
  { fn: registerSyncCommand, name: "sync" },
  { fn: registerStatsCommand, name: "stats" },
  { fn: registerHistoryCommand, name: "history" },
  { fn: registerCompaniesCommand, name: "companies" },
  { fn: registerImportCommand, name: "import" },
  { fn: registerAuditCommand, name: "audit" },
  { fn: registerWatchCommand, name: "watch" },
  { fn: registerBlocklistCommand, name: "blocklist" },
];

describe("CLI commands registration", () => {
  it("registers all 18 commands on the program", () => {
    const program = new Command();
    for (const { fn } of allRegisters) {
      fn(program);
    }

    const commandNames = program.commands.map((cmd) => cmd.name());
    expect(commandNames).toHaveLength(19);

    for (const { name } of allRegisters) {
      expect(commandNames).toContain(name);
    }
  });

  it.each(allRegisters)("$name registers exactly one command", ({ fn, name }) => {
    const program = new Command();
    fn(program);
    expect(program.commands).toHaveLength(1);
    expect(program.commands[0].name()).toBe(name);
  });
});

describe("parseRef", () => {
  it("parses full owner/repo#number format", async () => {
    const { parseRef } = await import("../../src/cli/shared");
    const result = parseRef("facebook/react#123");
    expect(result).toEqual({ owner: "facebook", repo: "react", issue: 123 });
  });
});
