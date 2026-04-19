import { Command } from "commander";
import path from "path";
import { getService } from "../shared";
import * as gh from "../../backend/lib/github";

export function registerAuditCommand(program: Command): void {
  program
    .command("audit <repo>")
    .description("Audit a repo — analyze codebase health and suggest improvements")
    .option("--dir <path>", "work directory", "~/repos/forks")
    .option("--create-issues", "create GitHub issues for findings")
    .option("--tokens <count>", "tokens consumed for this audit (split across created issues)")
    .action((repoArg: string, opts: any) => {
      const [owner, repo] = repoArg.split("/");
      if (!owner || !repo) {
        console.error("Error: format should be owner/repo");
        process.exit(1);
      }

      const svc = getService();

      console.log(`\n🔍 Auditing ${owner}/${repo}...\n`);

      const targetDir = path.join(opts.dir, repo);
      const repoDir = gh.cloneRepo(`${owner}/${repo}`, targetDir);

      const { execSync: exec } = require("child_process");
      const fs = require("fs");

      let fileList = "";
      try {
        fileList = exec("git ls-files", { cwd: repoDir, encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
      } catch { fileList = ""; }

      const files = fileList.trim().split("\n").filter(Boolean);
      const extCounts: Record<string, number> = {};
      for (const f of files) {
        const ext = f.includes(".") ? f.split(".").pop()! : "(none)";
        extCounts[ext] = (extCounts[ext] || 0) + 1;
      }

      const hasReadme = files.some(f => f.toLowerCase().startsWith("readme"));
      const hasContributing = files.some(f => f.toLowerCase().includes("contributing"));
      const hasLicense = files.some(f => f.toLowerCase().startsWith("license"));
      const hasCI = files.some(f => f.startsWith(".github/workflows/") || f === ".travis.yml" || f === ".circleci/config.yml");
      const hasTests = files.some(f => f.includes("test") || f.includes("spec") || f.includes("__tests__"));
      const hasEnvExample = files.some(f => f.includes(".env.example") || f.includes(".env.sample"));
      const hasDockerfile = files.some(f => f.toLowerCase() === "dockerfile" || f === "docker-compose.yml");
      const hasChangelog = files.some(f => f.toLowerCase().startsWith("changelog"));

      let recentCommits = 0;
      try {
        const count = exec('git rev-list --count --since="30 days ago" HEAD', {
          cwd: repoDir, encoding: "utf-8"
        }).trim();
        recentCommits = parseInt(count) || 0;
      } catch {}

      const info = gh.getRepoInfo(owner, repo);

      console.log(`📊 Repository Health Report\n`);
      console.log(`  📁 Files: ${files.length}`);
      const topExts = Object.entries(extCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
      console.log(`  📝 Top types: ${topExts.map(([ext, n]) => `${ext}(${n})`).join(", ")}`);
      console.log(`  ⭐ Stars: ${info.stars} | 🍴 Forks: ${info.forks} | 📋 Open issues: ${info.open_issues}`);
      console.log(`  📅 Commits (30d): ${recentCommits}`);
      console.log();

      console.log(`📋 Checklist\n`);
      const check = (ok: boolean, label: string) => console.log(`  ${ok ? "✅" : "❌"} ${label}`);
      check(hasReadme, "README");
      check(hasContributing, "CONTRIBUTING guide");
      check(hasLicense, "LICENSE");
      check(hasCI, "CI/CD (GitHub Actions, etc.)");
      check(hasTests, "Tests");
      check(hasEnvExample, ".env.example");
      check(hasDockerfile, "Dockerfile / docker-compose");
      check(hasChangelog, "CHANGELOG");
      console.log();

      const findings: string[] = [];
      if (!hasTests) findings.push("No test files detected — add unit/integration tests");
      if (!hasCI) findings.push("No CI/CD configuration — add GitHub Actions workflow");
      if (!hasContributing) findings.push("No CONTRIBUTING.md — makes it hard for new contributors");
      if (!hasEnvExample) findings.push("No .env.example — environment setup unclear");
      if (!hasChangelog) findings.push("No CHANGELOG — track releases and changes");
      if (!hasLicense) findings.push("No LICENSE — legal risk for contributors");
      if (recentCommits === 0) findings.push("No commits in 30 days — project may be stale");

      if (findings.length > 0) {
        console.log(`⚠️  Quick Findings (${findings.length})\n`);
        findings.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
        console.log();
      } else {
        console.log(`  ✨ No obvious issues found from quick scan.\n`);
      }

      console.log(`💡 For deeper analysis, run an AI-powered code review on the repo.`);
      console.log(`   Repo cloned at: ${repoDir}\n`);

      if (opts.createIssues && findings.length > 0) {
        console.log(`📝 Creating ${findings.length} issue(s)...\n`);
        for (const finding of findings) {
          try {
            const url = exec(
              `gh issue create -R ${owner}/${repo} --title "audit: ${finding.split(" — ")[0]}" --body "Found during automated audit.\n\n${finding}\n\nDiscovered by GoGetAJob audit."`,
              { encoding: "utf-8", timeout: 15000 }
            ).trim();
            console.log(`  ✅ ${url}`);

            const issueMatch = url.match(/\/issues\/(\d+)/);
            if (issueMatch) {
              svc.recordWork({
                workType: "issue",
                outputRepo: `${owner}/${repo}`,
                outputNumber: parseInt(issueMatch[1]),
                outputUrl: url,
                outputStatus: "open",
                tokensUsed: opts.tokens ? Math.round(parseInt(opts.tokens) / findings.length) : undefined,
                notes: `audit: ${finding.split(" — ")[0]}`,
                filedBy: gh.getMyLogin(),
              });
            }
          } catch (e: any) {
            console.log(`  ❌ Failed: ${finding.split(" — ")[0]}`);
          }
        }
        console.log();
      }
    });
}
