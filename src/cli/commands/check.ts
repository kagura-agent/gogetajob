import { Command } from "commander";
import { getService, parseRef } from "../shared";
import * as gh from "../../backend/lib/github";

export function registerCheckCommand(program: Command): void {
  program
    .command("check <ref>")
    .description("Deep-inspect an issue before taking it (format: owner/repo#issue_number)")
    .action((ref: string) => {
      const parsed = parseRef(ref);
      const svc = getService();

      const job = svc.getJob(parsed.owner, parsed.repo, parsed.issue);
      if (!job) {
        console.error(`Job not found: ${ref}. Run \`gogetajob scan ${parsed.owner}/${parsed.repo}\` first.`);
        process.exit(1);
      }

      const company = svc.getCompany(parsed.owner, parsed.repo);

      console.log(`\n🔍 Checking ${ref}...\n`);

      const prInfo = gh.checkLinkedPRs(parsed.owner, parsed.repo, parsed.issue);
      if (company) {
        svc.markJobHasPR(company.id, parsed.issue, prInfo.hasPR);
      }

      const difficultyStr = job.difficulty !== "unknown" ? ` | Difficulty: ${job.difficulty}` : "";
      console.log(`📋 ${job.title}`);
      console.log(`🏷️  Type: ${job.job_type} | Labels: ${job.labels.join(", ") || "none"}${difficultyStr}`);
      console.log(`💬 Comments: ${job.comments_count}`);
      console.log(`🔗 PR: ${prInfo.hasPR ? `⚠️  YES — PR(s) #${prInfo.prNumbers.join(", #")} already linked` : "✅ No linked PRs"}`);
      console.log();

      if (job.body) {
        console.log("── Issue Body ──────────────────────");
        console.log(job.body.length > 1000 ? job.body.slice(0, 1000) + "\n\n... (truncated)" : job.body);
        console.log("────────────────────────────────────");
      } else {
        console.log("📝 No issue body.");
      }

      console.log();
      const verdicts: string[] = [];
      let signal: "go" | "caution" | "skip" = "go";

      if (prInfo.hasPR) {
        verdicts.push("Someone may already be working on this (linked PR exists)");
        signal = "caution";
      }
      if (job.comments_count > 10) {
        verdicts.push("Lots of discussion — read comments first");
        if (signal === "go") signal = "caution";
      }
      if (company) {
        if (company.pr_merge_rate !== null && company.pr_merge_rate < 0.2 && company.forks > 1) {
          verdicts.push(`Very low merge rate (${(company.pr_merge_rate * 100).toFixed(0)}%) — your PR may not get reviewed`);
          signal = "skip";
        } else if (company.pr_merge_rate !== null && company.pr_merge_rate === 0 && company.forks <= 1) {
          verdicts.push("New repo — no PR history yet, review speed unknown");
          if (signal === "go") signal = "caution";
        } else if (company.pr_merge_rate !== null && company.pr_merge_rate < 0.5) {
          verdicts.push(`Low merge rate (${(company.pr_merge_rate * 100).toFixed(0)}%)`);
          if (signal === "go") signal = "caution";
        }
        if (company.has_cla) {
          verdicts.push("Requires CLA — check if you can sign it");
          if (signal === "go") signal = "caution";
        }
        if (company.last_commit_at) {
          const daysSince = Math.floor((Date.now() - new Date(company.last_commit_at).getTime()) / 86400000);
          if (daysSince > 180) {
            verdicts.push(`No commits in ${daysSince} days — project may be abandoned`);
            signal = "skip";
          } else if (daysSince > 60) {
            verdicts.push(`Last commit ${daysSince} days ago — may be slow to review`);
            if (signal === "go") signal = "caution";
          }
        }
      }
      if (!job.body || job.body.trim().length < 50) {
        verdicts.push("Vague issue description — unclear scope");
        if (signal === "go") signal = "caution";
      }

      // Check: how many open PRs do we already have in this repo?
      try {
        const myOpenPRs = gh.getMyOpenPRCount(parsed.owner, parsed.repo);
        if (myOpenPRs > 3) {
          verdicts.push(`You have ${myOpenPRs} open PRs here — close or merge some first`);
          signal = "skip";
        } else if (myOpenPRs >= 2) {
          verdicts.push(`You have ${myOpenPRs} open PRs here — maintainers may deprioritize new ones`);
          if (signal === "go") signal = "caution";
        }
      } catch (e: any) {
        console.warn(`[check] Could not fetch open PR count: ${e.message}`);
      }

      // Check: does this repo actually merge external contributions?
      try {
        const extRate = gh.getExternalMergeRate(parsed.owner, parsed.repo);
        if (extRate.externalRate === 0 && extRate.total >= 5) {
          verdicts.push(`No external PRs merged in last ${extRate.total} merges — maintainers may not accept outside contributions`);
          signal = "skip";
        } else if (extRate.externalRate < 0.2 && extRate.total >= 5) {
          verdicts.push(`Only ${(extRate.externalRate * 100).toFixed(0)}% of recent merges are from external contributors`);
          if (signal === "go") signal = "caution";
        }
      } catch (e: any) {
        console.warn(`[check] Could not fetch external merge rate: ${e.message}`);
      }

      // Check: is a maintainer already active on this issue?
      try {
        const maintainerActivity = gh.getMaintainerIssueActivity(parsed.owner, parsed.repo, parsed.issue);
        if (maintainerActivity.hasMaintainerComment && maintainerActivity.latestMaintainerDate) {
          const daysSince = (Date.now() - new Date(maintainerActivity.latestMaintainerDate).getTime()) / 86400000;
          if (daysSince <= 3) {
            verdicts.push("Maintainer commented in last 3 days — they may be fixing this themselves");
            if (signal === "go") signal = "caution";
          }
        }
      } catch (e: any) {
        console.warn(`[check] Could not fetch maintainer activity: ${e.message}`);
      }

      if (verdicts.length === 0) {
        verdicts.push("Looks open and healthy. Go for it!");
      }

      const icon = signal === "go" ? "✅" : signal === "caution" ? "⚠️ " : "🚫";
      console.log(`${icon} Verdict: ${signal.toUpperCase()}`);
      verdicts.forEach((v) => console.log(`   • ${v}`));
      console.log();
    });
}
