import { Command } from "commander";
import { getService } from "../shared";
import { formatCompany } from "../format";
import * as gh from "../../backend/lib/github";

export function registerInfoCommand(program: Command): void {
  program
    .command("info <repo>")
    .description("Show company profile (format: owner/repo)")
    .option("--refresh", "refresh from GitHub")
    .action(async (repoArg: string, opts: any) => {
      const [owner, repo] = repoArg.split("/");
      if (!owner || !repo) {
        console.error("Error: format should be owner/repo");
        process.exit(1);
      }

      const svc = getService();
      let company = svc.getCompany(owner, repo);

      if (!company || opts.refresh) {
        console.log(`Fetching ${owner}/${repo} from GitHub...`);
        try {
          const info = gh.getRepoInfo(owner, repo);
          const prStats = gh.getPrStats(owner, repo);
          svc.upsertCompany({
            owner: info.owner,
            repo: info.repo,
            description: info.description,
            language: info.language,
            stars: info.stars,
            forks: info.forks,
            open_issues: info.open_issues,
            pr_merge_rate: prStats.merge_rate,
            avg_response_hours: prStats.avg_response_hours !== null ? prStats.avg_response_hours : undefined,
            has_contributing_guide: info.has_contributing,
            last_commit_at: info.last_push,
          });
          company = svc.getCompany(owner, repo);
        } catch (e: any) {
          console.error(`Failed to fetch: ${e.message}`);
          process.exit(1);
        }
      }

      if (company) {
        console.log(`\n🏢 Company Profile\n`);
        console.log(formatCompany(company));
        console.log();
      }
    });
}
