import Database from "better-sqlite3";

export interface CompanyProfile {
  id: number;
  owner: string;
  repo: string;
  full_name: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  open_issues: number;
  pr_merge_rate: number | null;
  avg_response_hours: number | null;
  has_contributing_guide: boolean;
  has_cla: boolean;
  last_commit_at: string | null;
  disk_usage_kb: number | null;
  last_scanned_at: string | null;
}

export interface Job {
  id: number;
  company_id: number;
  issue_number: number;
  title: string;
  body: string | null;
  labels: string[];
  job_type: string;
  difficulty: string;
  has_bounty: boolean;
  bounty_amount: string | null;
  url: string;
  state: string;
  comments_count: number;
  has_pr: boolean;
  company_name?: string;
  company_language?: string;
  company_disk_usage_kb?: number | null;
}

export interface WorkEntry {
  id: number;
  job_id: number;
  status: string;
  pr_number: number | null;
  pr_url: string | null;
  pr_status: string | null;
  tokens_used: number | null;
  notes: string | null;
  taken_at: string;
  completed_at: string | null;
  job_title?: string;
  company_name?: string;
  issue_number?: number;
}

export class JobService {
  constructor(private db: Database.Database) {}

  // --- Companies ---

  upsertCompany(data: {
    owner: string;
    repo: string;
    description?: string;
    language?: string;
    stars?: number;
    forks?: number;
    open_issues?: number;
    pr_merge_rate?: number;
    avg_response_hours?: number;
    has_contributing_guide?: boolean;
    has_cla?: boolean;
    last_commit_at?: string;
    disk_usage_kb?: number;
  }): number {
    const stmt = this.db.prepare(`
      INSERT INTO companies (owner, repo, full_name, description, language, stars, forks, open_issues,
        pr_merge_rate, avg_response_hours, has_contributing_guide, has_cla, last_commit_at, disk_usage_kb, last_scanned_at)
      VALUES ($owner, $repo, $full_name, $description, $language, $stars, $forks, $open_issues,
        $pr_merge_rate, $avg_response_hours, $has_contributing_guide, $has_cla, $last_commit_at, $disk_usage_kb, datetime('now'))
      ON CONFLICT(owner, repo) DO UPDATE SET
        description = COALESCE($description, description),
        language = COALESCE($language, language),
        stars = COALESCE($stars, stars),
        forks = COALESCE($forks, forks),
        open_issues = COALESCE($open_issues, open_issues),
        pr_merge_rate = COALESCE($pr_merge_rate, pr_merge_rate),
        avg_response_hours = COALESCE($avg_response_hours, avg_response_hours),
        has_contributing_guide = COALESCE($has_contributing_guide, has_contributing_guide),
        has_cla = COALESCE($has_cla, has_cla),
        last_commit_at = COALESCE($last_commit_at, last_commit_at),
        disk_usage_kb = COALESCE($disk_usage_kb, disk_usage_kb),
        last_scanned_at = datetime('now')
    `);
    const params = {
      owner: data.owner,
      repo: data.repo,
      full_name: `${data.owner}/${data.repo}`,
      description: data.description ?? null,
      language: data.language ?? null,
      stars: data.stars ?? 0,
      forks: data.forks ?? 0,
      open_issues: data.open_issues ?? 0,
      pr_merge_rate: data.pr_merge_rate ?? null,
      avg_response_hours: data.avg_response_hours ?? null,
      has_contributing_guide: data.has_contributing_guide ? 1 : 0,
      has_cla: data.has_cla ? 1 : 0,
      last_commit_at: data.last_commit_at ?? null,
      disk_usage_kb: data.disk_usage_kb ?? null,
    };
    const result = stmt.run(params);
    if (result.changes > 0 && result.lastInsertRowid) {
      return Number(result.lastInsertRowid);
    }
    const row = this.db.prepare("SELECT id FROM companies WHERE owner = $owner AND repo = $repo").get({
      owner: data.owner, repo: data.repo
    }) as { id: number } | undefined;
    return row?.id ?? 0;
  }

  getCompany(owner: string, repo: string): CompanyProfile | null {
    const row = this.db.prepare("SELECT * FROM companies WHERE owner = $owner AND repo = $repo").get({
      owner, repo
    }) as any;
    if (!row) return null;
    return { ...row, has_contributing_guide: !!row.has_contributing_guide, has_cla: !!row.has_cla };
  }

  listCompanies(sort: string = "stars"): CompanyProfile[] {
    const validSorts: Record<string, string> = {
      "merge-rate": "pr_merge_rate DESC NULLS LAST",
      "activity": "last_commit_at DESC NULLS LAST",
      "stars": "stars DESC",
    };
    const orderBy = validSorts[sort] || "stars DESC";
    return (this.db.prepare(`SELECT * FROM companies ORDER BY ${orderBy}`).all() as any[]).map(r => ({
      ...r, has_contributing_guide: !!r.has_contributing_guide, has_cla: !!r.has_cla,
    }));
  }

  // --- Jobs ---

  upsertJob(companyId: number, data: {
    issue_number: number;
    title: string;
    body?: string;
    labels?: string[];
    job_type?: string;
    difficulty?: string;
    has_bounty?: boolean;
    bounty_amount?: string;
    url?: string;
    state?: string;
    comments_count?: number;
  }): number {
    const stmt = this.db.prepare(`
      INSERT INTO jobs (company_id, issue_number, title, body, labels, job_type, difficulty, has_bounty, bounty_amount, url, state, comments_count)
      VALUES ($company_id, $issue_number, $title, $body, $labels, $job_type, $difficulty, $has_bounty, $bounty_amount, $url, $state, $comments_count)
      ON CONFLICT(company_id, issue_number) DO UPDATE SET
        title = $title,
        body = COALESCE($body, body),
        labels = COALESCE($labels, labels),
        job_type = COALESCE($job_type, job_type),
        state = COALESCE($state, state),
        comments_count = COALESCE($comments_count, comments_count)
    `);
    const params = {
      company_id: companyId,
      issue_number: data.issue_number,
      title: data.title,
      body: data.body ?? null,
      labels: JSON.stringify(data.labels ?? []),
      job_type: data.job_type ?? "unknown",
      difficulty: data.difficulty ?? "unknown",
      has_bounty: data.has_bounty ? 1 : 0,
      bounty_amount: data.bounty_amount ?? null,
      url: data.url ?? null,
      state: (data.state ?? "open").toLowerCase(),
      comments_count: data.comments_count ?? 0,
    };
    const result = stmt.run(params);
    if (result.changes > 0 && result.lastInsertRowid) {
      return Number(result.lastInsertRowid);
    }
    const row = this.db.prepare(
      "SELECT id FROM jobs WHERE company_id = $company_id AND issue_number = $issue_number"
    ).get({ company_id: companyId, issue_number: data.issue_number }) as { id: number } | undefined;
    return row?.id ?? 0;
  }

  /** Mark jobs as closed if they're no longer in the open issues set */
  closeStaleJobs(companyId: number, openIssueNumbers: Set<number>): number {
    if (openIssueNumbers.size === 0) {
      // If no open issues at all, close everything for this company
      const result = this.db.prepare(
        "UPDATE jobs SET state = 'closed' WHERE company_id = $company_id AND state = 'open'"
      ).run({ company_id: companyId });
      return result.changes;
    }

    const openJobs = this.db.prepare(
      "SELECT id, issue_number FROM jobs WHERE company_id = $company_id AND state = 'open'"
    ).all({ company_id: companyId }) as { id: number; issue_number: number }[];

    let closed = 0;
    for (const job of openJobs) {
      if (!openIssueNumbers.has(job.issue_number)) {
        this.db.prepare("UPDATE jobs SET state = 'closed' WHERE id = $id").run({ id: job.id });
        closed++;
      }
    }
    return closed;
  }

  listJobs(filters: { lang?: string; type?: string; limit?: number; maxSizeMB?: number; noPr?: boolean } = {}): Job[] {
    const conditions: string[] = ["j.state = 'open'"];
    const params: Record<string, any> = {};

    if (filters.lang) {
      conditions.push("LOWER(c.language) = LOWER($lang)");
      params.lang = filters.lang;
    }
    if (filters.type) {
      conditions.push("j.job_type = $type");
      params.type = filters.type;
    }

    if (filters.maxSizeMB) {
      conditions.push("c.disk_usage_kb <= $maxSizeKb");
      params.maxSizeKb = filters.maxSizeMB * 1024;
    }
    if (filters.noPr) {
      conditions.push("j.has_pr = 0");
    }

    params.limit = filters.limit ?? 20;
    const where = conditions.join(" AND ");

    const rows = this.db.prepare(`
      SELECT j.*, c.full_name as company_name, c.language as company_language, c.disk_usage_kb as company_disk_usage_kb
      FROM jobs j
      JOIN companies c ON j.company_id = c.id
      WHERE ${where}
        AND NOT EXISTS (
          SELECT 1 FROM work_log w
          WHERE w.job_id = j.id AND w.status = 'done' AND w.pr_number IS NOT NULL
        )
      ORDER BY j.discovered_at DESC
      LIMIT $limit
    `).all(params) as any[];

    return rows.map(r => ({
      ...r,
      labels: JSON.parse(r.labels || "[]"),
      has_bounty: !!r.has_bounty,
      has_pr: !!r.has_pr,
      comments_count: r.comments_count ?? 0,
      company_disk_usage_kb: r.company_disk_usage_kb ?? null,
    }));
  }

  getJob(owner: string, repo: string, issueNumber: number): Job | null {
    const row = this.db.prepare(`
      SELECT j.*, c.full_name as company_name, c.language as company_language
      FROM jobs j
      JOIN companies c ON j.company_id = c.id
      WHERE c.owner = $owner AND c.repo = $repo AND j.issue_number = $issue_number
    `).get({ owner, repo, issue_number: issueNumber }) as any;
    if (!row) return null;
    return { ...row, labels: JSON.parse(row.labels || "[]"), has_bounty: !!row.has_bounty, has_pr: !!row.has_pr, comments_count: row.comments_count ?? 0 };
  }

  /** Find a job by issue number alone (for short-form refs) */
  findJobByIssueNumber(issueNumber: number): { owner: string; repo: string } | null {
    const row = this.db.prepare(`
      SELECT c.owner, c.repo FROM jobs j
      JOIN companies c ON j.company_id = c.id
      WHERE j.issue_number = $issue
      LIMIT 1
    `).get({ issue: issueNumber }) as { owner: string; repo: string } | undefined;
    return row || null;
  }

  guessRepoForIssue(issueNumber: number): { owner: string; repo: string } | null {
    // Try work_log first (e.g., self-filed issues that haven't been scanned yet)
    const row = this.db.prepare(`
      SELECT output_repo FROM work_log
      WHERE output_number = $issue AND work_type = 'issue' AND output_repo IS NOT NULL
      ORDER BY id DESC LIMIT 1
    `).get({ issue: issueNumber }) as { output_repo: string } | undefined;
    if (row?.output_repo) {
      const [owner, repo] = row.output_repo.split("/");
      if (owner && repo) return { owner, repo };
    }
    // Fallback: most recently scanned company
    const company = this.db.prepare(`
      SELECT owner, repo FROM companies ORDER BY last_scanned_at DESC LIMIT 1
    `).get() as { owner: string; repo: string } | undefined;
    return company || null;
  }

  // --- Work Log ---

  takeJob(jobId: number): number {
    const existing = this.db.prepare(
      "SELECT id FROM work_log WHERE job_id = $job_id AND status IN ('taken', 'in_progress')"
    ).get({ job_id: jobId });
    if (existing) throw new Error("Already working on this job");

    const result = this.db.prepare(
      "INSERT INTO work_log (job_id, status) VALUES ($job_id, 'taken')"
    ).run({ job_id: jobId });
    return Number(result.lastInsertRowid);
  }

  completeJob(jobId: number, data: {
    pr_number?: number;
    pr_url?: string;
    tokens_used?: number;
    notes?: string;
  }): void {
    const entry = this.db.prepare(
      "SELECT id FROM work_log WHERE job_id = $job_id AND status IN ('taken', 'in_progress') ORDER BY taken_at DESC LIMIT 1"
    ).get({ job_id: jobId }) as { id: number } | undefined;
    if (!entry) throw new Error("No active work entry for this job");

    this.db.prepare(`
      UPDATE work_log SET
        status = 'submitted',
        pr_number = COALESCE($pr_number, pr_number),
        pr_url = COALESCE($pr_url, pr_url),
        tokens_used = COALESCE($tokens_used, tokens_used),
        notes = COALESCE($notes, notes),
        completed_at = datetime('now')
      WHERE id = $id
    `).run({
      pr_number: data.pr_number ?? null,
      pr_url: data.pr_url ?? null,
      tokens_used: data.tokens_used ?? null,
      notes: data.notes ?? null,
      id: entry.id,
    });
  }

  /** Add follow-up tokens and notes to an existing work entry */
  followUp(owner: string, repo: string, issueNumber: number, data: {
    tokens: number;
    notes?: string;
  }): void {
    // Find the latest work entry for this issue
    const entry = this.db.prepare(`
      SELECT wl.id, wl.tokens_used, wl.notes FROM work_log wl
      JOIN jobs j ON wl.job_id = j.id
      JOIN companies c ON j.company_id = c.id
      WHERE c.owner = $owner AND c.repo = $repo AND j.issue_number = $issue_number
        AND wl.status IN ('submitted', 'done')
      ORDER BY wl.taken_at DESC LIMIT 1
    `).get({ owner, repo, issue_number: issueNumber }) as { id: number; tokens_used: number | null; notes: string | null } | undefined;

    if (!entry) throw new Error(`No work entry found for ${owner}/${repo}#${issueNumber}`);

    const newTokens = (entry.tokens_used || 0) + data.tokens;
    const newNotes = data.notes
      ? `${entry.notes || ''}\n[follow-up] ${data.notes}`.trim()
      : entry.notes;

    this.db.prepare(`
      UPDATE work_log SET tokens_used = $tokens, notes = $notes WHERE id = $id
    `).run({ tokens: newTokens, notes: newNotes, id: entry.id });
  }

  dropJob(jobId: number): void {
    const entry = this.db.prepare(
      "SELECT id FROM work_log WHERE job_id = $job_id AND status IN ('taken', 'in_progress') ORDER BY taken_at DESC LIMIT 1"
    ).get({ job_id: jobId }) as { id: number } | undefined;
    if (!entry) throw new Error("No active work entry for this job");

    this.db.prepare(
      "UPDATE work_log SET status = 'dropped', completed_at = datetime('now') WHERE id = $id"
    ).run({ id: entry.id });
  }

  /** Record a non-PR work entry (e.g., filing an issue from audit) */
  recordWork(data: {
    workType: string;
    outputRepo: string;
    outputNumber: number;
    outputUrl: string;
    outputStatus?: string;
    tokensUsed?: number;
    notes?: string;
    filedBy?: string;
  }): number {
    const result = this.db.prepare(`
      INSERT INTO work_log (job_id, status, work_type, output_repo, output_number, output_url, output_status, tokens_used, notes, filed_by, completed_at)
      VALUES (NULL, 'done', $work_type, $output_repo, $output_number, $output_url, $output_status, $tokens_used, $notes, $filed_by, datetime('now'))
    `).run({
      work_type: data.workType,
      output_repo: data.outputRepo,
      output_number: data.outputNumber,
      output_url: data.outputUrl,
      output_status: data.outputStatus ?? "open",
      tokens_used: data.tokensUsed ?? null,
      notes: data.notes ?? null,
      filed_by: data.filedBy ?? null,
    });
    return Number(result.lastInsertRowid);
  }

  /** Get all work entries that need syncing (PRs + issues) */
  listOutputsToSync(): any[] {
    return this.db.prepare(`
      SELECT w.*, j.title as job_title, j.issue_number,
        COALESCE(c.full_name, w.output_repo) as company_name,
        COALESCE(c.owner, '') as owner, COALESCE(c.repo, '') as repo
      FROM work_log w
      LEFT JOIN jobs j ON w.job_id = j.id AND w.job_id > 0
      LEFT JOIN companies c ON j.company_id = c.id
      WHERE w.status IN ('taken', 'done', 'submitted')
        AND (w.pr_number IS NOT NULL OR w.output_number IS NOT NULL)
        AND COALESCE(w.output_status, '') NOT IN ('deleted')
        AND COALESCE(w.pr_status, '') NOT IN ('MERGED', 'CLOSED', 'merged', 'closed')
        AND COALESCE(w.output_status, '') NOT IN ('closed')
      ORDER BY w.taken_at DESC
    `).all();
  }

  /** Update output status for any work type */
  updateOutputStatus(workLogId: number, status: string): void {
    this.db.prepare(
      "UPDATE work_log SET output_status = $status, pr_status = $status WHERE id = $id"
    ).run({ status, id: workLogId });
  }

  /** Transition a submitted work entry to done (merged) or closed */
  finalizeWork(workLogId: number, prStatus: string): void {
    const newStatus = prStatus === 'MERGED' ? 'done' : prStatus === 'CLOSED' ? 'done' : 'submitted';
    this.db.prepare(
      "UPDATE work_log SET status = $status, pr_status = $pr_status, completed_at = datetime('now') WHERE id = $id"
    ).run({ status: newStatus, pr_status: prStatus.toLowerCase(), id: workLogId });
  }

  /** List work entries finalized during or after a given timestamp */
  listRecentlyFinalized(since: string): any[] {
    return this.db.prepare(`
      SELECT w.*, j.issue_number,
        COALESCE(c.full_name, w.output_repo) as company_name
      FROM work_log w
      LEFT JOIN jobs j ON w.job_id = j.id AND w.job_id > 0
      LEFT JOIN companies c ON j.company_id = c.id
      WHERE w.pr_status IN ('merged', 'closed')
        AND w.completed_at >= $since
        AND w.pr_number IS NOT NULL
      ORDER BY w.completed_at DESC
    `).all({ since });
  }

  /** Check if an issue was filed by us and hasn't been adopted yet */
  isSelfFiledUnadopted(repo: string, issueNumber: number): boolean {
    const entry = this.db.prepare(`
      SELECT filed_by, output_status FROM work_log
      WHERE work_type = 'issue' AND output_repo = $repo AND output_number = $issue
      ORDER BY id DESC LIMIT 1
    `).get({ repo, issue: issueNumber }) as { filed_by: string | null; output_status: string | null } | undefined;

    if (!entry || !entry.filed_by) return false;
    return !["adopted", "discussing", "closed"].includes(entry.output_status || "");
  }

  listWorkHistory(filters: { repo?: string; status?: string; workType?: string } = {}): WorkEntry[] {
    const conditions: string[] = ["1=1"];
    const params: Record<string, any> = {};

    if (filters.status) {
      conditions.push("w.status = $status");
      params.status = filters.status;
    }
    if (filters.repo) {
      conditions.push("(c.full_name = $repo OR w.output_repo = $repo)");
      params.repo = filters.repo;
    }
    if (filters.workType) {
      // "pr" matches entries with pr_number set; "issue" matches work_type = 'issue'
      if (filters.workType === "pr") {
        conditions.push("w.pr_number IS NOT NULL");
      } else {
        conditions.push("w.work_type = $work_type");
        params.work_type = filters.workType;
      }
    }

    const where = conditions.join(" AND ");
    return this.db.prepare(`
      SELECT w.*, j.title as job_title, j.issue_number,
        COALESCE(c.full_name, w.output_repo) as company_name
      FROM work_log w
      LEFT JOIN jobs j ON w.job_id = j.id AND w.job_id > 0
      LEFT JOIN companies c ON j.company_id = c.id
      WHERE ${where}
      ORDER BY w.taken_at DESC
    `).all(params) as WorkEntry[];
  }

  getStats(): { total_jobs: number; taken: number; done: number; dropped: number; total_tokens: number } {
    const stats = this.db.prepare(`
      SELECT
        COUNT(*) as total_jobs,
        SUM(CASE WHEN status = 'taken' OR status = 'in_progress' THEN 1 ELSE 0 END) as taken,
        SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done,
        SUM(CASE WHEN status = 'dropped' THEN 1 ELSE 0 END) as dropped,
        COALESCE(SUM(tokens_used), 0) as total_tokens
      FROM work_log
    `).get() as any;
    return stats;
  }

  markJobHasPR(companyId: number, issueNumber: number, hasPR: boolean): void {
    this.db.prepare(
      "UPDATE jobs SET has_pr = $has_pr WHERE company_id = $company_id AND issue_number = $issue_number"
    ).run({ has_pr: hasPR ? 1 : 0, company_id: companyId, issue_number: issueNumber });
  }

  updatePRStatus(workLogId: number, prStatus: string): void {
    this.db.prepare(
      "UPDATE work_log SET pr_status = $pr_status WHERE id = $id"
    ).run({ pr_status: prStatus, id: workLogId });
  }

  /** Get all done entries that have a PR number (for syncing) */
  listPRsToSync(): Array<WorkEntry & { owner: string; repo: string }> {
    return this.db.prepare(`
      SELECT w.*, j.title as job_title, j.issue_number, c.full_name as company_name, c.owner, c.repo
      FROM work_log w
      JOIN jobs j ON w.job_id = j.id
      JOIN companies c ON j.company_id = c.id
      WHERE w.status = 'done' AND w.pr_number IS NOT NULL
      ORDER BY w.taken_at DESC
    `).all() as any[];
  }

  getIssueStats(): { total: number; adopted: number; discussing: number; open: number; closed: number; responded: number; tokens: number } {
    const rows = this.db.prepare(
      "SELECT output_status, tokens_used FROM work_log WHERE work_type = 'issue'"
    ).all() as { output_status: string | null; tokens_used: number | null }[];

    let adopted = 0, discussing = 0, open = 0, closed = 0, tokens = 0;
    for (const r of rows) {
      tokens += r.tokens_used || 0;
      const s = r.output_status || "open";
      if (s === "adopted") adopted++;
      else if (s === "discussing") discussing++;
      else if (s === "closed" || s === "deleted") closed++;
      else open++;
    }
    // responded = any issue that got past "open" state (adopted, discussing, closed all count)
    const responded = adopted + discussing + closed;
    return { total: rows.length, adopted, discussing, open, closed, responded, tokens };
  }

  getEnrichedStats(): {
    total_done: number;
    merged: number;
    pending: number;
    closed: number;
    total_tokens: number;
    tokens_per_merge: number;
    merge_rate: number;
    needs_action: number;
  } {
    const rows = this.db.prepare(`
      SELECT pr_status, tokens_used
      FROM work_log
      WHERE status IN ('done', 'submitted') AND pr_number IS NOT NULL
    `).all() as any[];

    let merged = 0, pending = 0, closed = 0, totalTokens = 0, needsAction = 0;
    for (const r of rows) {
      totalTokens += r.tokens_used || 0;
      const st = (r.pr_status || "open").toLowerCase();
      if (st === "merged") merged++;
      else if (st === "closed") closed++;
      else if (st === "changes_requested") { pending++; needsAction++; }
      else pending++;
    }

    const totalDone = rows.length;
    const concluded = merged + closed; // only count finished PRs for merge rate
    return {
      total_done: totalDone,
      merged,
      pending,
      closed,
      total_tokens: totalTokens,
      tokens_per_merge: merged > 0 ? Math.round(totalTokens / merged) : 0,
      merge_rate: concluded > 0 ? merged / concluded : 0,
      needs_action: needsAction,
    };
  }

  /** Check if a PR number already exists in work_log for a given repo */
  hasPRInLog(owner: string, repo: string, prNumber: number): boolean {
    // Check by job_id association
    const byJob = this.db.prepare(`
      SELECT id FROM work_log
      WHERE pr_number = $pr_number
        AND job_id IN (
          SELECT j.id FROM jobs j
          JOIN companies c ON j.company_id = c.id
          WHERE c.owner = $owner AND c.repo = $repo
        )
    `).get({ pr_number: prNumber, owner, repo });
    if (byJob) return true;

    // Also check by pr_url pattern (catches entries without job_id)
    const byUrl = this.db.prepare(`
      SELECT id FROM work_log
      WHERE pr_number = $pr_number
        AND (pr_url LIKE $url_pattern OR output_repo = $full_name)
    `).get({
      pr_number: prNumber,
      url_pattern: `%${owner}/${repo}/pull/${prNumber}`,
      full_name: `${owner}/${repo}`,
    });
    return !!byUrl;
  }

  /** Import a PR into work_log, linking to a job if possible */
  importPR(data: {
    owner: string;
    repo: string;
    issueNumber: number | null;
    prNumber: number;
    prUrl: string;
    prStatus: string;
    notes: string;
    createdAt: string;
    completedAt: string | null;
  }): number {
    // Try to find a matching job
    let jobId: number | null = null;
    if (data.issueNumber) {
      const job = this.getJob(data.owner, data.repo, data.issueNumber);
      if (job) {
        jobId = job.id;
      }
    }

    const result = this.db.prepare(`
      INSERT INTO work_log (job_id, status, pr_number, pr_url, pr_status, notes, taken_at, completed_at, work_type)
      VALUES ($job_id, $status, $pr_number, $pr_url, $pr_status, $notes, $taken_at, $completed_at, 'pr')
    `).run({
      job_id: jobId,
      status: data.prStatus === "MERGED" || data.prStatus === "CLOSED" ? "done" : "submitted",
      pr_number: data.prNumber,
      pr_url: data.prUrl,
      pr_status: data.prStatus.toLowerCase(),
      notes: data.notes,
      taken_at: data.createdAt,
      completed_at: data.completedAt,
    });
    return Number(result.lastInsertRowid);
  }
}
