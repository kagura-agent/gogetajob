import { Command } from "commander";
import { getService } from "../shared";
import { formatCompany } from "../format";

export function registerCompaniesCommand(program: Command): void {
  program
    .command("companies")
    .description("List known companies/repos")
    .option("--sort <field>", "sort: stars, merge-rate, activity", "stars")
    .action((opts: any) => {
      const svc = getService();
      const companies = svc.listCompanies(opts.sort);

      if (companies.length === 0) {
        console.log("\nNo companies yet. Try `gogetajob scan <owner/repo>`.\n");
        return;
      }

      console.log(`\n🏢 Companies (${companies.length})\n`);
      companies.forEach((c) => {
        console.log(formatCompany(c));
        console.log();
      });
    });
}
