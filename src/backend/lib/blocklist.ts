import fs from "fs";
import path from "path";
import os from "os";

const BLOCKLIST_DIR = path.join(os.homedir(), ".config", "gogetajob");
const BLOCKLIST_PATH = path.join(BLOCKLIST_DIR, "blocklist.json");

interface BlocklistData {
  repos: string[];
  reason: Record<string, string>;
}

function readBlocklist(): BlocklistData {
  try {
    const raw = fs.readFileSync(BLOCKLIST_PATH, "utf-8");
    const data = JSON.parse(raw);
    return {
      repos: Array.isArray(data.repos) ? data.repos : [],
      reason: data.reason && typeof data.reason === "object" ? data.reason : {},
    };
  } catch {
    return { repos: [], reason: {} };
  }
}

function writeBlocklist(data: BlocklistData): void {
  fs.mkdirSync(BLOCKLIST_DIR, { recursive: true });
  fs.writeFileSync(BLOCKLIST_PATH, JSON.stringify(data, null, 2) + "\n");
}

/**
 * Normalize repo name to lower-case for comparison.
 */
function normalize(name: string): string {
  return name.toLowerCase();
}

/**
 * Check if a repo is blocked. Case-insensitive.
 */
export function isBlocked(owner: string, repo: string): boolean {
  const fullName = `${owner}/${repo}`;
  const data = readBlocklist();
  return data.repos.some((r) => normalize(r) === normalize(fullName));
}

/**
 * Get the reason a repo is blocked (if any).
 */
export function getBlockReason(owner: string, repo: string): string | undefined {
  const fullName = `${owner}/${repo}`;
  const data = readBlocklist();
  // Case-insensitive lookup
  const entry = data.repos.find((r) => normalize(r) === normalize(fullName));
  if (!entry) return undefined;
  // Try exact key first, then case-insensitive
  if (data.reason[entry]) return data.reason[entry];
  const key = Object.keys(data.reason).find((k) => normalize(k) === normalize(fullName));
  return key ? data.reason[key] : undefined;
}

/**
 * Add a repo to the blocklist.
 */
export function addToBlocklist(fullName: string, reason?: string): void {
  const data = readBlocklist();
  // Don't duplicate (case-insensitive)
  if (!data.repos.some((r) => normalize(r) === normalize(fullName))) {
    data.repos.push(fullName);
  }
  if (reason) {
    data.reason[fullName] = reason;
  }
  writeBlocklist(data);
}

/**
 * Remove a repo from the blocklist.
 */
export function removeFromBlocklist(fullName: string): void {
  const data = readBlocklist();
  data.repos = data.repos.filter((r) => normalize(r) !== normalize(fullName));
  // Remove reason entries (case-insensitive)
  for (const key of Object.keys(data.reason)) {
    if (normalize(key) === normalize(fullName)) {
      delete data.reason[key];
    }
  }
  writeBlocklist(data);
}

/**
 * Get all blocked repos with their reasons.
 */
export function getBlocklist(): { repo: string; reason?: string }[] {
  const data = readBlocklist();
  return data.repos.map((repo) => ({
    repo,
    reason: data.reason[repo],
  }));
}
