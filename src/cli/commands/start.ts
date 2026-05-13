import { Command } from "commander";
import path from "path";
import { getService, parseRef } from "../shared";
import * as gh from "../../backend/lib/github";
import { isBlocked, getBlockReason } from "../../backend/lib/blocklist";

export function registerStartCommand(program: Command): void {
  program
    .command("start <ref>")
    .description("Take a job + fork/clone/branch — ready to code (format: owner/repo#issue_number)")
    .option("--dir <path>", "custom work directory", "~/repos/forks")
    .option("--force", "override self-filed issue guard")
    .option("--force-size", "override repo size limit")
    .action((ref: string, opts: any) => {
      const parsed = parseRef(ref);
      const svc = getService();

      if (isBlocked(parsed.owner, parsed.repo)) {
        const reason = getBlockReason(parsed.owner, parsed.repo);
        console.error(`\n⛔ ${parsed.owner}/${parsed.repo} is blocklisted${reason ? `: ${reason}` : ""}\n`);
        process.exit(1);
      }

      const job = svc.getJob(parsed.owner, parsed.repo, parsed.issue);
      if (!job) {
        console.error(`Job not found: ${ref}. Run \`gogetajob scan ${parsed.owner}/${parsed.repo}\` first.`);
        process.exit(1);
      }

      if (svc.isSelfFiledUnadopted(`${parsed.owner}/${parsed.repo}`, parsed.issue)) {
        if (!opts.force) {
          console.error(`\n⛔ This issue was filed by you and hasn't been acknowledged by the owner yet.`);
          console.error(`   Wait for the owner to respond, or use --force to override.\n`);
          process.exit(1);
        }
        console.log(`\n⚠️  Overriding self-filed guard (--force)\n`);
      }

      console.log(`\n🚀 Starting work on ${ref}...\n`);

      // Check repo size before cloning
      const company = svc.getCompany(parsed.owner, parsed.repo);
      const diskUsageKb = company?.disk_usage_kb;
      if (diskUsageKb) {
        const sizeMB = Math.round(diskUsageKb / 1024);
        if (diskUsageKb > 500 * 1024 && !opts.forceSize) {
          console.error(`\n⛔ Repo too large (${sizeMB}MB, limit 500MB). Use --force-size to override.\n`);
          process.exit(1);
        } else if (diskUsageKb > 200 * 1024) {
          console.log(`  ⚠️  Large repo (${sizeMB}MB). Clone may be slow.`);
        }
      }

      try {
        svc.takeJob(job.id);
        console.log(`  ✅ Job taken`);
      } catch (e: any) {
        if (e.message.includes("Already working")) {
          console.log(`  ℹ️  Already taken — continuing setup`);
        } else {
          console.error(`  ❌ ${e.message}`);
          process.exit(1);
        }
      }

      const myLogin = gh.getMyLogin();
      const isOwner = parsed.owner === myLogin;
      let cloneTarget: string;

      if (isOwner) {
        console.log(`  📦 You own this repo — no fork needed`);
        cloneTarget = `${parsed.owner}/${parsed.repo}`;
      } else {
        console.log(`  🍴 Forking ${parsed.owner}/${parsed.repo}...`);
        cloneTarget = gh.ensureFork(parsed.owner, parsed.repo, myLogin);
        console.log(`  ✅ Fork: ${cloneTarget}`);
      }

      const targetDir = path.join(opts.dir, parsed.repo);
      console.log(`  📥 Cloning to ${targetDir}...`);
      const repoDir = gh.cloneRepo(cloneTarget, targetDir);
      console.log(`  ✅ Cloned`);

      if (!isOwner) {
        gh.addUpstreamRemote(repoDir, parsed.owner, parsed.repo);
        console.log(`  🔗 Upstream remote added`);
      }

      const slug = job.title.toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 30)
        .replace(/-$/, "");
      const branchName = `fix/${parsed.issue}-${slug}`;
      gh.createBranch(repoDir, branchName);
      console.log(`  🌿 Branch: ${branchName}`);

      console.log(`\n🎯 Ready to work!`);
      console.log(`   cd ${repoDir}`);
      console.log(`   💡 Spawn a sub-agent in this directory for isolated token tracking`);
      console.log(`   # when done:`);
      console.log(`   gogetajob submit ${ref} --tokens <real_token_count>\n`);
    });
}
