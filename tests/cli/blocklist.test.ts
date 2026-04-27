import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import {
  isBlocked,
  getBlockReason,
  addToBlocklist,
  removeFromBlocklist,
  getBlocklist,
} from "../../src/backend/lib/blocklist";

const BLOCKLIST_DIR = path.join(os.homedir(), ".config", "gogetajob");
const BLOCKLIST_PATH = path.join(BLOCKLIST_DIR, "blocklist.json");

let originalContent: string | null = null;

describe("blocklist", () => {
  beforeEach(() => {
    try {
      originalContent = fs.readFileSync(BLOCKLIST_PATH, "utf-8");
    } catch {
      originalContent = null;
    }
    // Start with empty blocklist for tests
    fs.mkdirSync(BLOCKLIST_DIR, { recursive: true });
    fs.writeFileSync(BLOCKLIST_PATH, JSON.stringify({ repos: [], reason: {} }));
  });

  afterEach(() => {
    if (originalContent !== null) {
      fs.writeFileSync(BLOCKLIST_PATH, originalContent);
    } else {
      try {
        fs.unlinkSync(BLOCKLIST_PATH);
      } catch {}
    }
  });

  it("isBlocked returns false for unblocked repos", () => {
    expect(isBlocked("facebook", "react")).toBe(false);
  });

  it("isBlocked returns true for blocked repos", () => {
    addToBlocklist("mastra-ai/mastra", "test reason");
    expect(isBlocked("mastra-ai", "mastra")).toBe(true);
  });

  it("case-insensitive matching", () => {
    addToBlocklist("Mastra-AI/Mastra", "test");
    expect(isBlocked("mastra-ai", "mastra")).toBe(true);
    expect(isBlocked("MASTRA-AI", "MASTRA")).toBe(true);
  });

  it("addToBlocklist and getBlocklist work", () => {
    addToBlocklist("owner/repo1", "reason1");
    addToBlocklist("owner/repo2");
    const list = getBlocklist();
    expect(list).toHaveLength(2);
    expect(list[0]).toEqual({ repo: "owner/repo1", reason: "reason1" });
    expect(list[1]).toEqual({ repo: "owner/repo2", reason: undefined });
  });

  it("removeFromBlocklist works", () => {
    addToBlocklist("owner/repo", "reason");
    expect(isBlocked("owner", "repo")).toBe(true);
    removeFromBlocklist("owner/repo");
    expect(isBlocked("owner", "repo")).toBe(false);
  });

  it("getBlockReason returns the reason", () => {
    addToBlocklist("owner/repo", "the reason");
    expect(getBlockReason("owner", "repo")).toBe("the reason");
  });

  it("does not duplicate on re-add", () => {
    addToBlocklist("owner/repo", "reason1");
    addToBlocklist("owner/repo", "reason2");
    const list = getBlocklist();
    expect(list).toHaveLength(1);
  });
});
