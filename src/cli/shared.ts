import path from "path";
import Database from "better-sqlite3";
import { runMigrations } from "../backend/lib/migrations";
import { JobService } from "../backend/lib/job-service";

// --- DB setup ---
// Priority: GOGETAJOB_DATA env > package's own data/ dir
export const packageRoot = path.resolve(path.dirname(__filename), "..", "..");
export const dataDir =
  process.env.GOGETAJOB_DATA || path.join(packageRoot, "data");
export const dbPath = path.join(dataDir, "gogetajob.db");

export function getDb(): Database.Database {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  runMigrations(db);
  return db;
}

export function getService(): JobService {
  return new JobService(getDb());
}

// --- Self-update check ---
export function checkForUpdates(): void {
  // Skip in CI/subagent to avoid proxy-related SIGKILL (git fetch can hang)
  if (process.env.CI || process.env.GOGETAJOB_NO_UPDATE_CHECK) return;
  try {
    const { execSync } = require("child_process");
    const local = execSync("git rev-parse HEAD", { cwd: packageRoot, encoding: "utf-8", timeout: 2000 }).trim();
    // Use timeout command to hard-kill git fetch if it hangs (proxy/network issues)
    execSync("timeout 3 git fetch origin main --quiet 2>/dev/null", {
      cwd: packageRoot, encoding: "utf-8", timeout: 5000, stdio: "ignore"
    });
    const remote = execSync("git rev-parse origin/main", { cwd: packageRoot, encoding: "utf-8", timeout: 2000 }).trim();
    if (local !== remote) {
      console.log("⚠️  gogetajob is outdated. Run: cd " + packageRoot + " && git pull && npm run build\n");
    }
  } catch {
    // Silently skip if not a git repo or offline
  }
}

// --- Helpers ---
export function parseRef(ref: string): { owner: string; repo: string; issue: number } {
  // Full format: owner/repo#issue_number
  const match = ref.match(/^([^\/]+)\/([^#]+)#(\d+)$/);
  if (match) {
    return { owner: match[1]!, repo: match[2]!, issue: parseInt(match[3]!) };
  }

  // Short format: just a number (e.g., "34" or "#34")
  const numMatch = ref.match(/^#?(\d+)$/);
  if (numMatch) {
    const issueNum = parseInt(numMatch[1]!);
    const svc = getService();
    const job = svc.findJobByIssueNumber(issueNum);
    if (job) {
      return { owner: job.owner, repo: job.repo, issue: issueNum };
    }
    // Try to guess repo from work_log and suggest scan
    const guess = svc.guessRepoForIssue(issueNum);
    if (guess) {
      console.log(`  ℹ️  Issue #${issueNum} not in jobs table. Scanning ${guess.owner}/${guess.repo}...`);
      // Run scan inline
      const { execSync } = require("child_process");
      try {
        execSync(`node ${process.argv[1]} scan ${guess.owner}/${guess.repo}`, { stdio: "inherit" });
      } catch {}
      // Retry lookup
      const retryJob = svc.findJobByIssueNumber(issueNum);
      if (retryJob) {
        return { owner: retryJob.owner, repo: retryJob.repo, issue: issueNum };
      }
    }
    console.error(`No job found for issue #${issueNum}. Use full format: owner/repo#${issueNum}`);
    return process.exit(1);
  }

  console.error(`Invalid format: "${ref}". Expected: owner/repo#issue_number or just the issue number`);
  return process.exit(1);
}
