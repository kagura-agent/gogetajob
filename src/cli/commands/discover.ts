import { Command } from "commander";
import { getService } from "../shared";
import * as gh from "../../backend/lib/github";

export function registerDiscoverCommand(program: Command): void {
  program
    .command("discover")
    .description("Auto-discover repos worth contributing to")
    .option("--language <lang>", "programming language filter", "TypeScript")
    .option("--min-stars <n>", "minimum stars", "5")
    .option("--max-stars <n>", "maximum stars", "5000")
    .option("--active-days <n>", "max days since last push", "30")
    .option("--limit <n>", "number of candidates to evaluate", "10")
    .option("--topic <topic>", "filter by topic")
    .option("--keywords <words>", "search keywords to filter results (e.g. 'agent mcp ai')")
    .option("--exclude <repos>", "comma-separated owner/repo to exclude")
    .option("--auto-add", "automatically scan top recommended repos")
    .action(async (opts: any) => {
      const language = opts.language;
      const minStars = parseInt(opts.minStars);
      const maxStars = parseInt(opts.maxStars);
      const activeDays = parseInt(opts.activeDays);
      const limit = parseInt(opts.limit);
      const keywords = opts.keywords;
      const exclude = opts.exclude ? opts.exclude.split(",").map((s: string) => s.trim()) : [];

      console.log(`\n🔍 Discovering repos (language=${language}, stars=${minStars}..${maxStars}, active within ${activeDays}d${keywords ? `, keywords="${keywords}"` : ""})...\n`);

      const candidates = gh.searchRepos({
        language,
        minStars,
        maxStars,
        activeDays,
        limit,
        topic: opts.topic,
        keywords,
        exclude,
      });

      if (candidates.length === 0) {
        console.log("No repos found matching criteria. Try broader filters.\n");
        return;
      }

      console.log(`Found ${candidates.length} candidate(s). Evaluating...\n`);

      const svc = getService();

      interface ScoredRepo {
        owner: string;
        repo: string;
        stars: number;
        mergeRate: number;
        goodFirstIssues: number;
        helpWantedIssues: number;
        actionableIssues: number;
        score: number;
        reason: string;
      }

      const scored: ScoredRepo[] = [];

      for (const candidate of candidates) {
        const existing = svc.getCompany(candidate.owner, candidate.repo);
        if (existing) {
          continue;
        }

        const goodFirstIssues = gh.countLabeledIssues(candidate.owner, candidate.repo, "good first issue");
        const helpWantedIssues = gh.countLabeledIssues(candidate.owner, candidate.repo, "help wanted");
        const actionableIssues = goodFirstIssues + helpWantedIssues;

        if (actionableIssues === 0) {
          continue;
        }

        const prStats = gh.getPrStats(candidate.owner, candidate.repo);

        if (prStats.total >= 5 && prStats.merge_rate < 0.3) {
          continue;
        }

        const daysSinceLastCommit = candidate.lastPush
          ? (Date.now() - new Date(candidate.lastPush).getTime()) / 86400000
          : 30;
        const score =
          goodFirstIssues * 2 +
          helpWantedIssues +
          prStats.merge_rate * 10 +
          Math.log2(candidate.stars || 1) -
          daysSinceLastCommit * 0.1;

        const reasons: string[] = [];
        if (goodFirstIssues > 0) reasons.push(`${goodFirstIssues} good-first-issue`);
        if (helpWantedIssues > 0) reasons.push(`${helpWantedIssues} help-wanted`);
        if (prStats.merge_rate >= 0.7) reasons.push("high merge rate");

        scored.push({
          owner: candidate.owner,
          repo: candidate.repo,
          stars: candidate.stars,
          mergeRate: prStats.merge_rate,
          goodFirstIssues,
          helpWantedIssues,
          actionableIssues,
          score,
          reason: reasons.join(", "),
        });
      }

      if (scored.length === 0) {
        console.log("No repos with actionable issues found. Try different filters.\n");
        return;
      }

      scored.sort((a, b) => b.score - a.score);

      const header = [
        "#".padStart(2),
        "Repo".padEnd(35),
        "Stars".padStart(6),
        "Merge%".padStart(7),
        "Issues".padStart(6),
        "Score".padStart(6),
        "Reason",
      ].join("  ");

      console.log(header);
      console.log("─".repeat(header.length));

      scored.forEach((r, i) => {
        const row = [
          String(i + 1).padStart(2),
          `${r.owner}/${r.repo}`.slice(0, 35).padEnd(35),
          String(r.stars).padStart(6),
          `${(r.mergeRate * 100).toFixed(0)}%`.padStart(7),
          String(r.actionableIssues).padStart(6),
          r.score.toFixed(1).padStart(6),
          r.reason,
        ].join("  ");
        console.log(row);
      });

      console.log();

      if (opts.autoAdd) {
        const toScan = scored.slice(0, 5);
        console.log(`🔄 Auto-scanning top ${toScan.length} repo(s)...\n`);

        for (const r of toScan) {
          try {
            console.log(`── Scanning ${r.owner}/${r.repo} ──`);
            const info = gh.getRepoInfo(r.owner, r.repo);
            const prStats = gh.getPrStats(r.owner, r.repo, 50);

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

            const issues = gh.getIssues(r.owner, r.repo, { limit: 50 });
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
            svc.closeStaleJobs(companyId, openIssueNumbers);
            console.log(`  ⭐ ${info.stars} stars | 📊 ${(prStats.merge_rate * 100).toFixed(0)}% merge rate | 📋 ${added} issues\n`);
          } catch (e: any) {
            console.log(`  ❌ Failed: ${e.message}\n`);
          }
        }
      }
    });
}
