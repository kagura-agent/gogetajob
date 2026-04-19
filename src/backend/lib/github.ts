import { execSync, exec as execCb } from "child_process";
import { promisify } from "util";

const execAsync = promisify(execCb);

// Uses `gh` CLI — the most natural way for an agent to talk to GitHub

export interface RepoInfo {
  owner: string;
  repo: string;
  description: string;
  language: string;
  stars: number;
  forks: number;
  open_issues: number;
  last_push: string;
  has_contributing: boolean;
}

export interface IssueInfo {
  number: number;
  title: string;
  body: string;
  labels: string[];
  state: string;
  url: string;
  created_at: string;
  comments: number;
}

export interface PrStats {
  total: number;
  merged: number;
  closed: number;
  merge_rate: number;
  avg_response_hours: number | null;
}

function gh(args: string): string {
  try {
    return execSync(`gh ${args}`, {
      encoding: "utf-8",
      timeout: 30000,
      stdio: ["pipe", "pipe", "pipe"], // capture stderr to avoid noisy 404s
    }).trim();
  } catch (e: any) {
    throw new Error(`gh command failed: ${e.stderr || e.message}`);
  }
}

function ghJson(args: string): any {
  const out = gh(args);
  if (!out) return null;
  return JSON.parse(out);
}

export function getRepoInfo(owner: string, repo: string): RepoInfo {
  const data = ghJson(
    `repo view ${owner}/${repo} --json name,description,primaryLanguage,stargazerCount,forkCount,issues,pushedAt`
  );

  // Check if CONTRIBUTING.md exists
  let hasContributing = false;
  try {
    gh(`api repos/${owner}/${repo}/contents/CONTRIBUTING.md --jq .name`);
    hasContributing = true;
  } catch {}

  return {
    owner,
    repo,
    description: data.description || "",
    language: data.primaryLanguage?.name || "Unknown",
    stars: data.stargazerCount,
    forks: data.forkCount,
    open_issues: data.issues?.totalCount || 0,
    last_push: data.pushedAt,
    has_contributing: hasContributing,
  };
}

export function getIssues(
  owner: string,
  repo: string,
  opts: { limit?: number; labels?: string } = {}
): IssueInfo[] {
  const limit = opts.limit || 30;
  let cmd = `issue list -R ${owner}/${repo} --state open --limit ${limit} --json number,title,body,labels,state,url,createdAt,comments`;
  if (opts.labels && opts.labels.length > 0) {
    cmd += ` --label "${opts.labels}"`;
  }
  const data = ghJson(cmd);
  if (!data) return [];
  return data.map((d: any) => ({
    number: d.number,
    title: d.title,
    body: d.body || "",
    labels: (d.labels || []).map((l: any) => l.name),
    state: d.state,
    url: d.url,
    created_at: d.createdAt,
    comments: d.comments?.totalCount ?? 0,
  }));
}

export function getPrStats(owner: string, repo: string, limit: number = 100): PrStats {
  // Get recent closed/merged PRs to calculate merge rate
  const prs = ghJson(
    `pr list -R ${owner}/${repo} --state all --limit ${limit} --json number,state,mergedAt,closedAt,createdAt,reviews`
  );

  if (!prs || prs.length === 0) {
    return { total: 0, merged: 0, closed: 0, merge_rate: 0, avg_response_hours: null };
  }

  let merged = 0;
  let closed = 0;
  let responseTimes: number[] = [];

  for (const pr of prs) {
    if (pr.mergedAt) {
      merged++;
    } else if (pr.state === "CLOSED") {
      closed++;
    }

    // Calculate response time from first review
    if (pr.reviews && pr.reviews.length > 0 && pr.createdAt) {
      const created = new Date(pr.createdAt).getTime();
      const firstReview = new Date(pr.reviews[0].submittedAt || pr.reviews[0].createdAt).getTime();
      if (firstReview > created) {
        responseTimes.push((firstReview - created) / (1000 * 60 * 60));
      }
    }
  }

  const total = prs.length;
  const finishedPrs = merged + closed;

  return {
    total,
    merged,
    closed,
    merge_rate: finishedPrs > 0 ? merged / finishedPrs : 0,
    avg_response_hours: responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : null,
  };
}

// --- Async versions for concurrent scanning ---

async function ghA(args: string): Promise<string> {
  try {
    const { stdout } = await execAsync(`gh ${args}`, {
      encoding: "utf-8",
      timeout: 30000,
    });
    return (stdout || "").trim();
  } catch (e: any) {
    throw new Error(`gh command failed: ${e.stderr || e.message}`);
  }
}

async function ghJsonA(args: string): Promise<any> {
  const out = await ghA(args);
  if (!out) return null;
  return JSON.parse(out);
}

export async function getRepoInfoAsync(owner: string, repo: string): Promise<RepoInfo> {
  const data = await ghJsonA(
    `repo view ${owner}/${repo} --json name,description,primaryLanguage,stargazerCount,forkCount,issues,pushedAt`
  );

  let hasContributing = false;
  try {
    await ghA(`api repos/${owner}/${repo}/contents/CONTRIBUTING.md --jq .name`);
    hasContributing = true;
  } catch {}

  return {
    owner,
    repo,
    description: data.description || "",
    language: data.primaryLanguage?.name || "Unknown",
    stars: data.stargazerCount,
    forks: data.forkCount,
    open_issues: data.issues?.totalCount || 0,
    last_push: data.pushedAt,
    has_contributing: hasContributing,
  };
}

export async function getIssuesAsync(
  owner: string,
  repo: string,
  opts: { limit?: number; labels?: string } = {}
): Promise<IssueInfo[]> {
  const limit = opts.limit || 30;
  let cmd = `issue list -R ${owner}/${repo} --state open --limit ${limit} --json number,title,body,labels,state,url,createdAt,comments`;
  if (opts.labels && opts.labels.length > 0) {
    cmd += ` --label "${opts.labels}"`;
  }
  const data = await ghJsonA(cmd);
  if (!data) return [];
  return data.map((d: any) => ({
    number: d.number,
    title: d.title,
    body: d.body || "",
    labels: (d.labels || []).map((l: any) => l.name),
    state: d.state,
    url: d.url,
    created_at: d.createdAt,
    comments: d.comments?.totalCount ?? 0,
  }));
}

export async function getPrStatsAsync(owner: string, repo: string, limit: number = 100): Promise<PrStats> {
  const prs = await ghJsonA(
    `pr list -R ${owner}/${repo} --state all --limit ${limit} --json number,state,mergedAt,closedAt,createdAt,reviews`
  );

  if (!prs || prs.length === 0) {
    return { total: 0, merged: 0, closed: 0, merge_rate: 0, avg_response_hours: null };
  }

  let merged = 0;
  let closed = 0;
  let responseTimes: number[] = [];

  for (const pr of prs) {
    if (pr.mergedAt) {
      merged++;
    } else if (pr.state === "CLOSED") {
      closed++;
    }

    if (pr.reviews && pr.reviews.length > 0 && pr.createdAt) {
      const created = new Date(pr.createdAt).getTime();
      const firstReview = new Date(pr.reviews[0].submittedAt || pr.reviews[0].createdAt).getTime();
      if (firstReview > created) {
        responseTimes.push((firstReview - created) / (1000 * 60 * 60));
      }
    }
  }

  const total = prs.length;
  const finishedPrs = merged + closed;

  return {
    total,
    merged,
    closed,
    merge_rate: finishedPrs > 0 ? merged / finishedPrs : 0,
    avg_response_hours: responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : null,
  };
}

export function classifyIssue(issue: IssueInfo): { type: string; difficulty: string } {
  const title = issue.title.toLowerCase();
  const labels = issue.labels.map(l => l.toLowerCase());
  const body = (issue.body || "").toLowerCase();

  // Type classification
  let type = "other";
  if (labels.some(l => l.includes("bug") || l.includes("defect")) || title.includes("bug") || title.includes("fix")) {
    type = "bug";
  } else if (labels.some(l => l.includes("feature") || l.includes("enhancement"))) {
    type = "feature";
  } else if (labels.some(l => l.includes("doc") || l.includes("documentation")) || title.includes("doc")) {
    type = "docs";
  } else if (labels.some(l => l.includes("test")) || title.includes("test")) {
    type = "test";
  } else if (labels.some(l => l.includes("refactor")) || title.includes("refactor")) {
    type = "refactor";
  }

  // Difficulty classification
  let difficulty = "unknown";
  if (labels.some(l => l.includes("good first issue") || l.includes("beginner") || l.includes("easy"))) {
    difficulty = "easy";
  } else if (labels.some(l => l.includes("help wanted"))) {
    difficulty = "medium";
  } else if (labels.some(l => l.includes("complex") || l.includes("hard"))) {
    difficulty = "hard";
  } else if (body.length > 2000 || labels.some(l => l.includes("feature"))) {
    difficulty = "medium";
  }

  return { type, difficulty };
}

/** Check if an issue has linked/associated open PRs */
export function checkLinkedPRs(owner: string, repo: string, issueNumber: number): { hasPR: boolean; prNumbers: number[] } {
  try {
    // Search for open PRs that mention this issue
    const prs = ghJson(
      `pr list -R ${owner}/${repo} --state open --limit 20 --json number,title,body`
    );
    if (!prs || prs.length === 0) return { hasPR: false, prNumbers: [] };

    const linked: number[] = [];
    const pattern = new RegExp(`(fixes|closes|resolves)\\s*#${issueNumber}\\b`, "i");
    const refPattern = new RegExp(`#${issueNumber}\\b`);

    for (const pr of prs) {
      const text = `${pr.title || ""} ${pr.body || ""}`;
      if (pattern.test(text) || refPattern.test(text)) {
        linked.push(pr.number);
      }
    }

    return { hasPR: linked.length > 0, prNumbers: linked };
  } catch {
    return { hasPR: false, prNumbers: [] };
  }
}

/** Get current authenticated GitHub username */
export function getMyLogin(): string {
  return gh("api user --jq .login");
}

/** Fork a repo if not already forked. Returns the fork's full_name (e.g. myuser/repo) */
export function ensureFork(owner: string, repo: string, myLogin: string): string {
  // If I own the repo, no fork needed
  if (owner === myLogin) return `${owner}/${repo}`;

  // Check if fork already exists
  try {
    ghJson(`repo view ${myLogin}/${repo} --json name`);
    return `${myLogin}/${repo}`;
  } catch {
    // Fork it
    gh(`repo fork ${owner}/${repo} --clone=false`);
    return `${myLogin}/${repo}`;
  }
}

/** Clone a repo to a target dir (shallow). Returns the absolute path. */
export function cloneRepo(fullName: string, targetDir: string): string {
  const { execSync: exec } = require("child_process");
  const fs = require("fs");
  const p = require("path");

  const absDir = p.resolve(targetDir);
  const expectedUrl = `https://github.com/${fullName}.git`;

  if (fs.existsSync(p.join(absDir, ".git"))) {
    // Already cloned — ensure origin points to the right place
    const currentOrigin = exec("git remote get-url origin", {
      cwd: absDir, encoding: "utf-8", timeout: 5000,
    }).trim();
    if (currentOrigin !== expectedUrl) {
      exec(`git remote set-url origin ${expectedUrl}`, {
        cwd: absDir, encoding: "utf-8", timeout: 5000,
      });
    }
    // Hard-kill fetch after 10s to avoid proxy-related SIGKILL on the parent process
    try {
      exec("timeout 10 git fetch --all", { cwd: absDir, encoding: "utf-8", timeout: 15000 });
    } catch (e: any) {
      console.warn(`[cloneRepo] git fetch failed (non-fatal, repo exists locally): ${e.message}`);
    }
    return absDir;
  }

  try {
    exec(`timeout 30 git clone --depth 10 ${expectedUrl} ${absDir}`, {
      encoding: "utf-8",
      timeout: 45000,
    });
  } catch (e: any) {
    // If clone failed but repo dir already exists (partial clone), warn instead of throwing
    if (fs.existsSync(p.join(absDir, ".git"))) {
      console.warn(`[cloneRepo] git clone failed but repo exists locally: ${e.message}`);
    } else {
      throw e;
    }
  }
  return absDir;
}

/** Create a branch and check it out */
export function createBranch(repoDir: string, branchName: string): void {
  const { execSync: exec } = require("child_process");
  try {
    exec(`git checkout -b ${branchName}`, { cwd: repoDir, encoding: "utf-8" });
  } catch {
    // Branch might already exist
    exec(`git checkout ${branchName}`, { cwd: repoDir, encoding: "utf-8" });
  }
}

/** Add upstream remote if working from a fork */
export function addUpstreamRemote(repoDir: string, upstreamOwner: string, repo: string): void {
  const { execSync: exec } = require("child_process");
  // Check if upstream already exists
  try {
    exec("git remote get-url upstream", { cwd: repoDir, encoding: "utf-8", stdio: "pipe" });
    // Already exists — no-op
  } catch {
    // Doesn't exist — add it
    exec(`git remote add upstream https://github.com/${upstreamOwner}/${repo}.git`, {
      cwd: repoDir,
      encoding: "utf-8",
    });
  }
}

/** Push current branch and create a PR. Returns PR URL. */
export function pushAndCreatePR(
  repoDir: string,
  upstreamOwner: string,
  upstreamRepo: string,
  issueNumber: number,
  title: string,
  body: string,
): string {
  const { execSync: exec } = require("child_process");

  // Get current branch
  const branch = exec("git rev-parse --abbrev-ref HEAD", {
    cwd: repoDir,
    encoding: "utf-8",
  }).trim();

  // Get the fork owner from origin remote URL
  const originUrl = exec("git remote get-url origin", {
    cwd: repoDir,
    encoding: "utf-8",
  }).trim();
  const forkMatch = originUrl.match(/github\.com[/:]([^/]+)\//);
  const forkOwner = forkMatch ? forkMatch[1] : getMyLogin();

  // Push
  exec(`git push -u origin ${branch}`, {
    cwd: repoDir,
    encoding: "utf-8",
    timeout: 30000,
  });

  // Check if a PR already exists from this branch
  const headRef = forkOwner === upstreamOwner ? branch : `${forkOwner}:${branch}`;
  try {
    const existingPR = exec(
      `gh pr list -R ${upstreamOwner}/${upstreamRepo} --head ${headRef} --json url --jq '.[0].url'`,
      { cwd: repoDir, encoding: "utf-8", timeout: 15000, stdio: ["pipe", "pipe", "pipe"] },
    ).trim();
    if (existingPR) {
      return existingPR; // PR already exists, return its URL
    }
  } catch {
    // No existing PR found, create one
  }

  // Create PR
  const prUrl = exec(
    `gh pr create -R ${upstreamOwner}/${upstreamRepo} --head ${headRef} --title "${title.replace(/"/g, '\\"')}" --body "${body.replace(/"/g, '\\"')}"`,
    { cwd: repoDir, encoding: "utf-8", timeout: 30000 },
  ).trim();

  return prUrl;
}

export interface PRStatusInfo {
  number: number;
  state: string;       // OPEN | MERGED | CLOSED
  mergedAt: string | null;
  closedAt: string | null;
  reviewComments: number;
  reviews: Array<{
    state: string;     // APPROVED | CHANGES_REQUESTED | COMMENTED
    author: string;
    body: string;
  }>;
  needsAction: boolean;  // true if there are unaddressed review requests
  ciStatus: string | null; // SUCCESS | FAILURE | PENDING | null
  lastUpdated: string;
}

/** Get detailed PR status including reviews and CI */
export function getPRStatus(owner: string, repo: string, prNumber: number): PRStatusInfo {
  const data = ghJson(
    `pr view ${prNumber} -R ${owner}/${repo} --json number,state,mergedAt,closedAt,reviews,comments,updatedAt,statusCheckRollup`
  );

  const reviews = (data.reviews || []).map((r: any) => ({
    state: r.state || "COMMENTED",
    author: r.author?.login || "unknown",
    body: r.body || "",
  }));

  // Needs action if:
  // 1. Any reviewer's LATEST review is CHANGES_REQUESTED (not just any historical review), or
  // 2. There are COMMENTED reviews with suggestions that haven't been superseded by APPROVED
  // Group reviews by author and check only the latest from each reviewer
  const latestByAuthor = new Map<string, { state: string; body: string }>();
  for (const r of reviews) {
    latestByAuthor.set(r.author, { state: r.state, body: r.body });
  }
  const hasChangesRequested = Array.from(latestByAuthor.values()).some(r => r.state === "CHANGES_REQUESTED");
  const hasReviewComments = Array.from(latestByAuthor.values()).some(r => r.state === "COMMENTED" && r.body.length > 0);
  const needsAction = hasChangesRequested || hasReviewComments;

  // Parse CI status from statusCheckRollup
  let ciStatus: string | null = null;
  const checks = data.statusCheckRollup || [];
  if (checks.length > 0) {
    const hasFailure = checks.some((c: any) => c.conclusion === "FAILURE" || c.conclusion === "ERROR");
    const allSuccess = checks.every((c: any) => c.conclusion === "SUCCESS" || c.conclusion === "NEUTRAL" || c.conclusion === "SKIPPED");
    const hasPending = checks.some((c: any) => c.status === "IN_PROGRESS" || c.status === "QUEUED" || c.status === "PENDING");
    ciStatus = hasFailure ? "FAILURE" : allSuccess ? "SUCCESS" : hasPending ? "PENDING" : null;
  }

  return {
    number: data.number,
    state: data.mergedAt ? "MERGED" : data.state,
    mergedAt: data.mergedAt || null,
    closedAt: data.closedAt || null,
    reviewComments: data.comments?.totalCount ?? 0,
    reviews,
    needsAction,
    ciStatus,
    lastUpdated: data.updatedAt || "",
  };
}

/** Get issue status — is it open, closed, has someone started working on it? */
export function getIssueStatus(owner: string, repo: string, issueNumber: number): {
  state: string;
  comments: number;
  hasLinkedPR: boolean;
  hasNonAuthorComment: boolean;
} {
  const data = ghJson(
    `issue view ${issueNumber} -R ${owner}/${repo} --json state,comments,author`
  );
  const state = (data.state || "OPEN").toLowerCase();
  const issueAuthor = data.author?.login || "";
  const commentsList = data.comments || [];
  const comments = commentsList.length;

  // Check if someone other than the issue author commented
  const hasNonAuthorComment = commentsList.some(
    (c: any) => c.author?.login && c.author.login !== issueAuthor
  );

  const { hasPR } = checkLinkedPRs(owner, repo, issueNumber);
  return { state, comments, hasLinkedPR: hasPR, hasNonAuthorComment };
}

/** Get comments on an issue */
export function getIssueComments(owner: string, repo: string, issueNumber: number): Array<{author: string, body: string, created: string}> {
  try {
    const raw = gh(`api repos/${owner}/${repo}/issues/${issueNumber}/comments --jq '[.[] | {author: .user.login, body: .body, created: .created_at}]'`);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export interface MyPRInfo {
  number: number;
  title: string;
  state: string; // OPEN, MERGED, CLOSED
  url: string;
  createdAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  body: string;
  linkedIssueNumber: number | null;
}

export interface SearchRepoResult {
  owner: string;
  repo: string;
  description: string;
  language: string;
  stars: number;
  forks: number;
  lastPush: string;
}

/** Search GitHub for repos matching criteria using `gh search repos` */
export function searchRepos(opts: {
  language?: string;
  minStars?: number;
  maxStars?: number;
  activeDays?: number;
  limit?: number;
  topic?: string;
}): SearchRepoResult[] {
  const parts: string[] = ["search", "repos"];

  // Build query string (inline qualifiers) and flags
  const queryParts: string[] = [];
  const minStars = opts.minStars ?? 5;
  const maxStars = opts.maxStars ?? 5000;
  queryParts.push(`stars:${minStars}..${maxStars}`);
  if (opts.activeDays) {
    const since = new Date(Date.now() - opts.activeDays * 86400000).toISOString().split("T")[0];
    queryParts.push(`pushed:>=${since}`);
  }
  if (opts.topic) queryParts.push(`topic:${opts.topic}`);

  // Query goes as a quoted argument
  parts.push(`"${queryParts.join(" ")}"`);

  // Language goes as a flag (gh search repos --language)
  if (opts.language) {
    parts.push("--language", opts.language);
  }

  parts.push("--sort", "stars", "--order", "desc");
  parts.push("--limit", String(opts.limit ?? 10));
  parts.push("--json", "owner,name,description,language,stargazersCount,forksCount,pushedAt,fullName");

  const data = ghJson(parts.join(" "));
  if (!Array.isArray(data)) return [];

  return data.map((d: any) => ({
    owner: d.owner?.login || d.owner || "",
    repo: d.name || "",
    description: d.description || "",
    language: d.language || "Unknown",
    stars: d.stargazersCount ?? 0,
    forks: d.forksCount ?? 0,
    lastPush: d.pushedAt || "",
  }));
}

/** Count open issues with a specific label */
export function countLabeledIssues(owner: string, repo: string, label: string): number {
  try {
    const data = ghJson(
      `issue list -R ${owner}/${repo} --state open --label "${label}" --limit 100 --json number`
    );
    return Array.isArray(data) ? data.length : 0;
  } catch {
    return 0;
  }
}

export interface GitHubPRSummary {
  repo: string;       // "owner/repo"
  number: number;
  title: string;
  state: string;      // OPEN, MERGED, CLOSED
  url: string;
  createdAt: string;
}

/**
 * Search all PRs authored by the current user across GitHub.
 * Uses `gh search prs` which leverages GitHub's search API.
 * Excludes PRs in repos owned by the user (not "work for others").
 */
export function searchAllMyPRs(): GitHubPRSummary[] {
  const myLogin = getMyLogin();
  const results: GitHubPRSummary[] = [];
  const seen = new Set<string>();

  // Query open and closed separately. Closed includes merged PRs —
  // GitHub search returns state=MERGED for merged PRs in the results.
  for (const stateFilter of ["open", "closed"] as const) {
    let raw: any[];
    try {
      raw = ghJson(
        `search prs --author=${myLogin} --state=${stateFilter} --limit 200 --json repository,number,title,state,url,createdAt`
      );
    } catch {
      continue;
    }
    if (!Array.isArray(raw)) continue;

    for (const pr of raw) {
      const repoFullName: string = pr.repository?.nameWithOwner || pr.repository?.name || "";
      if (!repoFullName) continue;
      // Exclude own repos (kagura-agent/*)
      const repoOwner = repoFullName.split("/")[0]?.toLowerCase();
      if (repoOwner === myLogin.toLowerCase()) continue;

      const key = `${repoFullName}#${pr.number}`;
      if (seen.has(key)) continue;
      seen.add(key);

      results.push({
        repo: repoFullName,
        number: pr.number,
        title: pr.title || "",
        state: pr.state || "OPEN",
        url: pr.url || "",
        createdAt: pr.createdAt || "",
      });
    }
  }

  return results;
}

export function getMyPRs(owner: string, repo: string): MyPRInfo[] {
  const myLogin = getMyLogin();
  const raw = ghJson(
    `pr list -R ${owner}/${repo} --author ${myLogin} --state all --json number,title,state,url,createdAt,mergedAt,closedAt,body --limit 200`
  );
  if (!Array.isArray(raw)) return [];

  return raw.map((pr: any) => {
    // Try to extract linked issue number from PR body or title
    // Common patterns: "Closes #N", "Fixes #N", "#N", "owner/repo#N"
    let linkedIssue: number | null = null;
    const text = `${pr.body || ""} ${pr.title || ""}`;
    const patterns = [
      new RegExp(`(?:closes|fixes|resolves)\\s+#(\\d+)`, "i"),
      new RegExp(`(?:closes|fixes|resolves)\\s+${owner}/${repo}#(\\d+)`, "i"),
      new RegExp(`${owner}/${repo}#(\\d+)`),
      /\b#(\d+)\b/,
    ];
    for (const pat of patterns) {
      const m = text.match(pat);
      if (m) {
        linkedIssue = parseInt(m[1]);
        break;
      }
    }

    return {
      number: pr.number,
      title: pr.title,
      state: pr.state,
      url: pr.url,
      createdAt: pr.createdAt,
      mergedAt: pr.mergedAt || null,
      closedAt: pr.closedAt || null,
      body: pr.body || "",
      linkedIssueNumber: linkedIssue,
    };
  });
}
