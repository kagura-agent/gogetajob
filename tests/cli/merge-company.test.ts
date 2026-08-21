import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";
import { runMigrations } from "../../src/backend/lib/migrations";
import { JobService } from "../../src/backend/lib/job-service";
import { getBlocklist } from "../../src/backend/lib/blocklist";

// Isolation: JobService.listJobs() reads the real blocklist from ~/.config.
// Point HOME at a temp dir so tests never touch the real blocklist.
const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "gogetajob-test-"));
process.env.HOME = tmpHome;
fs.mkdirSync(path.join(tmpHome, ".config", "gogetajob"), { recursive: true });
fs.writeFileSync(
  path.join(tmpHome, ".config", "gogetajob", "blocklist.json"),
  JSON.stringify({ repos: [], reason: {} })
);

let db: Database.Database;
let svc: JobService;
let dbPath: string;

beforeEach(() => {
  dbPath = path.join(fs.mkdtempSync(path.join(tmpHome, "db-")), "test.db");
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  runMigrations(db);
  svc = new JobService(db);
});

afterEach(() => {
  db.close();
});

describe("mergeCompany (repo rename dedup)", () => {
  function seedCompany(fullName: string, stars: number): number {
    const [owner, repo] = fullName.split("/");
    return svc.upsertCompany({
      owner, repo, description: "desc", language: "TypeScript",
      stars, forks: 1, open_issues: 1, last_commit_at: "2026-08-21T00:00:00Z",
    });
  }

  function seedJob(companyId: number, issueNumber: number, title: string): number {
    return svc.upsertJob(companyId, {
      issue_number: issueNumber,
      title,
      labels: [],
      url: `https://github.com/x/y/issues/${issueNumber}`,
      state: "open",
    });
  }

  it("merges duplicate rows created by repo rename, deduping jobs and re-pointing work_log", () => {
    const canonicalId = seedCompany("EKKOLearnAI/hermes-studio", 10441);
    const staleId = seedCompany("EKKOLearnAI/hermes-web-ui", 10441);

    // Overlapping issues (canonical has #100/#101, stale has #101/#102)
    const cJob100 = seedJob(canonicalId, 100, "issue 100");
    const cJob101 = seedJob(canonicalId, 101, "issue 101 (canonical)");
    const sJob101 = seedJob(staleId, 101, "issue 101 (stale)");
    const sJob102 = seedJob(staleId, 102, "issue 102");

    // work_log pointing at the stale #102 job and the duplicate stale #101 job
    db.prepare(
      "INSERT INTO work_log (job_id, status, taken_at) VALUES (?, 'done', datetime('now'))"
    ).run(sJob102);
    db.prepare(
      "INSERT INTO work_log (job_id, status, taken_at) VALUES (?, 'done', datetime('now'))"
    ).run(sJob101);

    const result = svc.mergeCompany("EKKOLearnAI/hermes-studio", "EKKOLearnAI/hermes-web-ui");

    expect(result).toBe(canonicalId);

    // Stale company row is gone
    const staleRow = db.prepare(
      "SELECT id FROM companies WHERE owner = 'EKKOLearnAI' AND repo = 'hermes-web-ui'"
    ).get();
    expect(staleRow).toBeUndefined();

    // Jobs: #100 (canonical-only), #101 (canonical wins dedup), #102 (moved from stale)
    const jobs = db.prepare(
      "SELECT issue_number, title FROM jobs WHERE company_id = ? ORDER BY issue_number"
    ).all(canonicalId) as { issue_number: number; title: string }[];
    expect(jobs).toHaveLength(3);
    expect(jobs.map(j => j.issue_number)).toEqual([100, 101, 102]);
    const j101 = jobs.find(j => j.issue_number === 101)!;
    expect(j101.title).toBe("issue 101 (canonical)");

    // All stale jobs deleted (including the duplicate #101)
    const staleJobCount = db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE company_id = ?").get(staleId) as { n: number };
    expect(staleJobCount.n).toBe(0);

    // work_log re-pointed: stale #102 log → canonical #102 job, stale #101 log → canonical #101 job
    const logs = db.prepare(
      `SELECT wl.id, wl.job_id, j.issue_number AS issue FROM work_log wl
       JOIN jobs j ON j.id = wl.job_id
       WHERE j.company_id = ? ORDER BY j.issue_number`
    ).all(canonicalId) as { id: number; job_id: number; issue: number }[];
    expect(logs).toHaveLength(2);
    expect(logs.map(l => l.issue).sort()).toEqual([101, 102]);
    const cJob101Id = db.prepare("SELECT id FROM jobs WHERE company_id = ? AND issue_number = 101").get(canonicalId) as { id: number };
    const cJob102Id = db.prepare("SELECT id FROM jobs WHERE company_id = ? AND issue_number = 102").get(canonicalId) as { id: number };
    expect(logs.some(l => l.job_id === cJob101Id.id && l.issue === 101)).toBe(true);
    expect(logs.some(l => l.job_id === cJob102Id.id && l.issue === 102)).toBe(true);
  });

  it("is a no-op when only one row exists", () => {
    const id = seedCompany("A/B", 1);
    const result = svc.mergeCompany("A/B", "A/old-name");
    expect(result).toBe(id);
    // no crash, nothing changed
    expect(svc.listCompanies("stars").some(c => c.full_name === "A/B")).toBe(true);
  });

  it("keeps the canonical row's metadata and moves jobs when issue sets are disjoint", () => {
    const canonicalId = seedCompany("A/new-name", 99);
    const staleId = seedCompany("A/old-name", 5);
    seedJob(canonicalId, 1, "one");
    seedJob(staleId, 2, "two");
    seedJob(staleId, 3, "three");

    svc.mergeCompany("A/new-name", "A/old-name");

    const jobs = db.prepare(
      "SELECT issue_number FROM jobs WHERE company_id = ? ORDER BY issue_number"
    ).all(canonicalId) as { issue_number: number }[];
    expect(jobs.map(j => j.issue_number)).toEqual([1, 2, 3]);
    const remaining = db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE company_id = ?").get(staleId) as { n: number };
    expect(remaining.n).toBe(0);
    // metadata kept from canonical
    const row = db.prepare("SELECT stars FROM companies WHERE id = ?").get(canonicalId) as { stars: number };
    expect(row.stars).toBe(99);
  });
});
