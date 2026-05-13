import chalk from "chalk";
import type { CompanyProfile, Job, WorkEntry } from "../backend/lib/job-service";

export function formatJob(job: Job, index?: number): string {
  const prefix = index !== undefined ? chalk.gray(`${index + 1}.`) : "";
  const bounty = job.has_bounty ? chalk.green(" 💰") : "";
  const type = chalk.cyan(`[${job.job_type}]`);
  const difficulty = job.difficulty !== "unknown"
    ? chalk.yellow(` (${job.difficulty})`)
    : "";
  const prFlag = job.has_pr ? chalk.red(" 🔴 PR exists") : "";
  const commentInfo = job.comments_count > 0 ? chalk.gray(` 💬${job.comments_count}`) : "";
  const repoSize = job.company_disk_usage_kb
    ? chalk.blue(` 📦 ${(job.company_disk_usage_kb / 1024).toFixed(0)} MB`)
    : "";

  // Body summary: first meaningful line, max 150 chars
  let bodySummary = "";
  if (job.body) {
    const clean = job.body
      .replace(/\r?\n/g, " ")
      .replace(/#{1,6}\s*/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (clean.length > 0) {
      bodySummary = `   ${chalk.gray("📝 " + (clean.length > 150 ? clean.slice(0, 150) + "..." : clean))}`;
    }
  }

  return [
    `${prefix} ${type}${difficulty}${bounty}${prFlag}${repoSize}${commentInfo} ${chalk.bold(job.title)}`,
    `   ${chalk.gray(job.company_name || "")} #${job.issue_number}`,
    job.labels && job.labels.length > 0
      ? `   ${job.labels.map((l: string) => chalk.magenta(l)).join(" ")}`
      : null,
    bodySummary || null,
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatCompany(company: CompanyProfile): string {
  const mergeRate = company.pr_merge_rate !== null && company.pr_merge_rate !== undefined
    ? `${(company.pr_merge_rate * 100).toFixed(0)}%`
    : "?";
  const responseTime = company.avg_response_hours !== null && company.avg_response_hours !== undefined
    ? `${company.avg_response_hours.toFixed(1)}h`
    : "?";
  const cla = company.has_cla ? chalk.red(" ⚠CLA") : "";
  const contributing = company.has_contributing_guide ? chalk.green(" 📋") : "";

  return [
    `${chalk.bold(company.full_name)}${cla}${contributing}`,
    `  ⭐ ${company.stars}  🍴 ${company.forks}  📋 ${company.open_issues} issues`,
    `  📊 Merge rate: ${mergeRate}  ⏱ Response: ${responseTime}`,
    `  🔤 ${company.language || "Unknown"}  📅 Last commit: ${company.last_commit_at || "?"}`,
    company.description ? `  ${chalk.gray(company.description)}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatWorkEntry(entry: any): string {
  const statusIcon: Record<string, string> = {
    taken: "🔵",
    in_progress: "🟡",
    done: "✅",
    dropped: "❌",
  };
  // Distinguish merged vs closed for done entries
  let icon = statusIcon[entry.status] || "⚪";
  if (entry.status === "done" && entry.pr_status) {
    const prSt = entry.pr_status.toLowerCase();
    if (prSt === "closed") icon = "🚫";  // closed without merge
    // merged stays ✅
  }
  const tokens = entry.tokens_used ? chalk.gray(` (${entry.tokens_used} tokens)`) : "";
  const workType = entry.work_type || "pr";

  if (workType === "issue") {
    const outputStatus = entry.output_status ? chalk.gray(` [${entry.output_status}]`) : "";
    return [
      `${icon} [Issue] ${chalk.bold(entry.output_repo || entry.company_name || "")} #${entry.output_number || ""}${outputStatus}${tokens}`,
      entry.notes ? `  📝 ${entry.notes}` : null,
      `  ${chalk.gray(`created: ${entry.completed_at || entry.taken_at}`)}`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  const pr = entry.pr_number ? chalk.cyan(` PR #${entry.pr_number}`) : "";
  return [
    `${icon} [PR] ${chalk.bold(entry.company_name || "")} #${entry.issue_number || ""}${pr}${tokens}`,
    `  ${entry.job_title || ""}`,
    `  ${chalk.gray(`taken: ${entry.taken_at}`)}${entry.completed_at ? chalk.gray(` → ${entry.completed_at}`) : ""}`,
    entry.notes ? `  📝 ${entry.notes}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}
