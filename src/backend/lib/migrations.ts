import Database from "better-sqlite3";

export function runMigrations(db: Database.Database): void {
  db.exec(`
    -- Companies: GitHub repos we know about
    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner TEXT NOT NULL,
      repo TEXT NOT NULL,
      full_name TEXT NOT NULL,
      description TEXT,
      language TEXT,
      stars INTEGER DEFAULT 0,
      forks INTEGER DEFAULT 0,
      open_issues INTEGER DEFAULT 0,
      pr_merge_rate REAL,           -- 0.0 ~ 1.0
      avg_response_hours REAL,      -- average time to first response on PRs
      has_contributing_guide INTEGER DEFAULT 0,
      has_cla INTEGER DEFAULT 0,
      last_commit_at TEXT,
      last_scanned_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(owner, repo)
    );

    -- Jobs: individual work opportunities (issues)
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      issue_number INTEGER NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      labels TEXT,                   -- JSON array
      job_type TEXT DEFAULT 'unknown', -- bug|feature|docs|test|refactor|other
      difficulty TEXT DEFAULT 'unknown', -- easy|medium|hard|unknown
      has_bounty INTEGER DEFAULT 0,
      bounty_amount TEXT,
      url TEXT,
      state TEXT DEFAULT 'open',     -- open|closed
      discovered_at TEXT DEFAULT (datetime('now')),
      UNIQUE(company_id, issue_number),
      FOREIGN KEY (company_id) REFERENCES companies(id)
    );

    -- Work log: our work history
    CREATE TABLE IF NOT EXISTS work_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL,
      status TEXT DEFAULT 'taken',   -- taken|in_progress|done|dropped
      pr_number INTEGER,
      pr_url TEXT,
      pr_status TEXT,                -- open|merged|closed
      tokens_used INTEGER,
      notes TEXT,
      taken_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT,
      FOREIGN KEY (job_id) REFERENCES jobs(id)
    );
  `);
  // Migration 2: add body, comments_count, has_pr to jobs
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migration_check (id INTEGER);
    DROP TABLE _migration_check;
  `);
  
  // Check if body column exists
  const cols = db.prepare(`PRAGMA table_info(jobs)`).all() as any[];
  const colNames = cols.map((c: any) => c.name);
  
  if (!colNames.includes('body')) {
    db.exec(`ALTER TABLE jobs ADD COLUMN body TEXT DEFAULT ''`);
  }
  if (!colNames.includes('comments_count')) {
    db.exec(`ALTER TABLE jobs ADD COLUMN comments_count INTEGER DEFAULT 0`);
  }
  if (!colNames.includes('has_pr')) {
    db.exec(`ALTER TABLE jobs ADD COLUMN has_pr INTEGER DEFAULT 0`);
  }

  // Migration 3: add token snapshot fields to work_log for accurate tracking
  const wlCols = db.prepare(`PRAGMA table_info(work_log)`).all() as any[];
  const wlColNames = wlCols.map((c: any) => c.name);

  if (!wlColNames.includes('tokens_at_start')) {
    db.exec(`ALTER TABLE work_log ADD COLUMN tokens_at_start INTEGER`);
  }
  if (!wlColNames.includes('tokens_at_end')) {
    db.exec(`ALTER TABLE work_log ADD COLUMN tokens_at_end INTEGER`);
  }

  // Migration 4: support multiple work types (pr, issue, review)
  if (!wlColNames.includes('work_type')) {
    db.exec(`ALTER TABLE work_log ADD COLUMN work_type TEXT DEFAULT 'pr'`);
  }
  if (!wlColNames.includes('output_url')) {
    db.exec(`ALTER TABLE work_log ADD COLUMN output_url TEXT`);
  }
  if (!wlColNames.includes('output_status')) {
    db.exec(`ALTER TABLE work_log ADD COLUMN output_status TEXT`);
  }
  if (!wlColNames.includes('output_repo')) {
    db.exec(`ALTER TABLE work_log ADD COLUMN output_repo TEXT`);
  }
  if (!wlColNames.includes('output_number')) {
    db.exec(`ALTER TABLE work_log ADD COLUMN output_number INTEGER`);
  }

  // Make job_id nullable for non-PR work types
  const jobIdCol = wlCols.find((c: any) => c.name === 'job_id');
  if (jobIdCol && (jobIdCol as any).notnull === 1) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS work_log_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER,
        status TEXT DEFAULT 'taken',
        pr_number INTEGER,
        pr_url TEXT,
        pr_status TEXT,
        tokens_used INTEGER,
        notes TEXT,
        taken_at TEXT DEFAULT (datetime('now')),
        completed_at TEXT,
        tokens_at_start INTEGER,
        tokens_at_end INTEGER,
        work_type TEXT DEFAULT 'pr',
        output_url TEXT,
        output_status TEXT,
        output_repo TEXT,
        output_number INTEGER,
        FOREIGN KEY (job_id) REFERENCES jobs(id)
      );
      INSERT INTO work_log_new SELECT * FROM work_log;
      DROP TABLE work_log;
      ALTER TABLE work_log_new RENAME TO work_log;
    `);
  }

  // Migration 5: add filed_by for issue lifecycle tracking
  const wlCols5 = db.prepare(`PRAGMA table_info(work_log)`).all() as any[];
  const wlColNames5 = wlCols5.map((c: any) => c.name);
  if (!wlColNames5.includes('filed_by')) {
    db.exec(`ALTER TABLE work_log ADD COLUMN filed_by TEXT`);
  }

  // Migration 6: add disk_usage_kb to companies
  const companyCols = db.prepare(`PRAGMA table_info(companies)`).all() as any[];
  const companyColNames = companyCols.map((c: any) => c.name);
  if (!companyColNames.includes('disk_usage_kb')) {
    db.exec(`ALTER TABLE companies ADD COLUMN disk_usage_kb INTEGER`);
  }
}
