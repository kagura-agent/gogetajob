import { Command } from "commander";
import { getService } from "../shared";
import * as gh from "../../backend/lib/github";

async function pLimit(concurrency: number) {
  const queue: Array<() => void> = [];
  let active = 0;
  function next() {
    if (queue.length > 0 && active < concurrency) {
      active++;
      queue.shift()!();
    }
  }
  return async function<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = () => fn().then(resolve, reject).finally(() => { active--; next(); });
      queue.push(run);
      next();
    });
  };
}

export function registerScanCommand(program: Command): void {
  program
    .command("scan [repo]")
    .description(
      "Scan a repo for open issues and add them as jobs (format: owner/repo)\n\n" +
      "  Use --all to scan all known companies from the database.\n\n" +
      "  Finding repos to scan:\n" +
      "    gh search repos --topic=typescript --sort=stars --limit=10\n" +
      "    gh search repos --language=python --stars='>100' --limit=10\n" +
      "    Browse https://github.com/trending"
    )
    .option("--refresh", "force refresh existing data")
    .option("--label <label>", "only issues with this label")
    .option("--all", "scan all known companies from database")
    .option("--concurrency <n>", "number of companies to scan in parallel (default: 3)", "3")
    .action(async (repoArg: string | undefined, opts: any) => {
      const svc = getService();

      if (opts.all) {
        const companies = svc.listCompanies("stars");
        if (companies.length === 0) {
          console.log("\nNo companies in database. Add some with `gogetajob scan <owner/repo>`.\n");
          return;
        }
        const concurrency = Math.max(1, parseInt(opts.concurrency) || 3);
        console.log(`\n🔍 Scanning all ${companies.length} companies (concurrency: ${concurrency})...\n`);
        const limit = await pLimit(concurrency);
        let completed = 0;

        async function scanCompany(c: any) {
          try {
            const [owner, repo] = c.full_name.split("/");
            const [info, prStats] = await Promise.all([
              gh.getRepoInfoAsync(owner, repo),
              gh.getPrStatsAsync(owner, repo, 50),
            ]);
            svc.upsertCompany({
              owner: info.owner, repo: info.repo,
              description: info.description, language: info.language,
              stars: info.stars, forks: info.forks, open_issues: info.open_issues,
              pr_merge_rate: prStats.merge_rate,
              avg_response_hours: prStats.avg_response_hours !== null ? prStats.avg_response_hours : undefined,
              has_contributing_guide: info.has_contributing, last_commit_at: info.last_push,
            });
            const issues = await gh.getIssuesAsync(owner, repo, { limit: 50, labels: opts.label });
            let added = 0;
            const openIssueNumbers = new Set<number>();
            for (const issue of issues) {
              openIssueNumbers.add(issue.number);
              const wasAdded = svc.upsertJob(c.id, {
                issue_number: issue.number,
                title: issue.title,
                body: issue.body,
                labels: issue.labels,
                url: issue.url,
                state: issue.state,
                comments_count: issue.comments,
              });
              if (wasAdded) added++;
            }
            svc.closeStaleJobs(c.id, openIssueNumbers);
            completed++;
            const heapMB = process.memoryUsage().heapUsed / (1024 * 1024);
            console.log(`[${completed}/${companies.length}] ${c.full_name} ⭐ ${info.stars} | 📊 ${(prStats.merge_rate * 100).toFixed(0)}%${added > 0 ? ` | 📋 ${added} new` : ""}`);
            if (heapMB > 200) {
              console.warn(`⚠️ High memory usage: ${heapMB.toFixed(0)}MB heap`);
            }
          } catch (e: any) {
            completed++;
            console.error(`[${completed}/${companies.length}] ${c.full_name} ⚠️ ${e.message}`);
          }
        }

        await Promise.all(companies.map(c => limit(() => scanCompany(c))));
        console.log("\nDone!\n");
        return;
      }

      if (!repoArg) {
        console.error("Error: provide a repo (owner/repo) or use --all");
        process.exit(1);
      }

      const [owner, repo] = repoArg.split("/");
      if (!owner || !repo) {
        console.error("Error: format should be owner/repo");
        process.exit(1);
      }

      // 1. Get/update company info
      console.log(`\n🔍 Scanning ${owner}/${repo}...`);
      const info = gh.getRepoInfo(owner, repo);
      const prStats = gh.getPrStats(owner, repo, 50);

      const companyId = svc.upsertCompany({
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

      console.log(`  ⭐ ${info.stars} stars | 📊 ${(prStats.merge_rate * 100).toFixed(0)}% merge rate | ${prStats.total} PRs analyzed`);

      // 2. Get issues
      const issues = gh.getIssues(owner, repo, {
        limit: 50,
        labels: opts.label,
      });

      let added = 0;
      const openIssueNumbers = new Set<number>();
      for (const issue of issues) {
        openIssueNumbers.add(issue.number);
        const classified = gh.classifyIssue(issue);
        svc.upsertJob(companyId, {
          issue_number: issue.number,
          title: issue.title,
          body: issue.body,
          labels: issue.labels,
          job_type: classified.type,
          difficulty: classified.difficulty,
          has_bounty: issue.labels.some(l => l.toLowerCase().includes("bounty")),
          url: issue.url,
          state: issue.state.toLowerCase(),
          comments_count: issue.comments,
        });
        added++;
      }

      // Mark issues no longer open as closed
      const closed = svc.closeStaleJobs(companyId, openIssueNumbers);
      if (closed > 0) {
        console.log(`  🔒 ${closed} issues marked as closed`);
      }

      console.log(`  📋 ${added} issues discovered`);
      console.log(`  Done!\n`);
    });
}
