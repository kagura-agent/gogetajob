import { Command } from "commander";
import { getService } from "../shared";
import * as gh from "../../backend/lib/github";
export function registerSyncCommand(program: Command): void {
  program
    .command("sync")
    .description("Check PR and issue statuses — update work log with latest results")
    .action(() => {
      const svc = getService();
      const entries = svc.listOutputsToSync();

      if (entries.length === 0) {
        console.log("\nNothing to sync.\n");
        return;
      }

      const prEntries = entries.filter((e: any) => e.pr_number && (!e.work_type || e.work_type === "pr"));
      const issueEntries = entries.filter((e: any) => e.work_type === "issue" && e.output_number);

      const total = prEntries.length + issueEntries.length;
      console.log(`\n🔄 Syncing ${total} item(s)...\n`);

      const KNOWN_BOTS = ["coderabbitai", "github-actions", "github-actions[bot]", "dependabot", "dependabot[bot]", "codecov", "codecov[bot]", "netlify", "netlify[bot]", "vercel", "vercel[bot]", "sonarcloud", "sonarcloud[bot]"];
      const isBot = (author: string) => KNOWN_BOTS.includes(author.toLowerCase()) || author.endsWith("[bot]");

      let merged = 0, needsAction = 0, open = 0, closed = 0;
      let issueAdopted = 0, issueOpen = 0, issueClosed = 0;
      const newlyFinalized: Array<{ entry: any; state: string }> = [];

      for (const entry of prEntries) {
        try {
          let prOwner = "", prRepo = "";
          if (entry.company_name) {
            [prOwner, prRepo] = entry.company_name.split("/");
          }
          if ((!prOwner || !prRepo) && entry.pr_url) {
            const m = entry.pr_url.match(/github\.com\/([^/]+)\/([^/]+)\/pull/);
            if (m) { prOwner = m[1]; prRepo = m[2]; }
          }
          if (!prOwner || !prRepo) continue;
          const status = gh.getPRStatus(prOwner, prRepo, entry.pr_number!);
          svc.updatePRStatus(entry.id, status.state);

          if ((entry.status === "submitted" || entry.status === "taken") && (status.state === "MERGED" || status.state === "CLOSED")) {
            const wasPreviouslyOpen = !entry.pr_status || !["merged", "closed"].includes(entry.pr_status.toLowerCase());
            if (wasPreviouslyOpen) {
              newlyFinalized.push({ entry, state: status.state });
            }
            svc.finalizeWork(entry.id, status.state);
          }

          const icon = status.state === "MERGED" ? "✅"
            : status.state === "CLOSED" ? "❌"
            : status.needsAction ? "🔴"
            : "🔵";

          const statusLabel = (entry.status === "submitted" || entry.status === "taken") && status.state === "OPEN" ? "PENDING" : status.state;
          const displayName = prOwner + "/" + prRepo;
          console.log(`  ${icon} [PR] ${displayName}#${entry.issue_number || '?'} PR #${entry.pr_number} — ${statusLabel}`);

          if (status.needsAction) {
            const hasChangesReq = status.reviews.some((r: any) => r.state === "CHANGES_REQUESTED");
            if (hasChangesReq) {
              console.log(`     ⚠️  Changes requested — follow up needed!`);
            } else {
              const commentReviews = status.reviews.filter((r: any) => r.state === "COMMENTED" && r.body.length > 0);
              const humanComments = commentReviews.filter((r: any) => !isBot(r.author));
              const botComments = commentReviews.filter((r: any) => isBot(r.author));
              console.log(`     💬 ${commentReviews.length} review comment(s) (${humanComments.length} human, ${botComments.length} bot) — check and respond!`);
              for (const r of humanComments.slice(0, 3)) {
                console.log(`        👤 ${r.author}: ${r.body.slice(0, 80)}${r.body.length > 80 ? "..." : ""}`);
              }
              for (const r of botComments.slice(0, 2)) {
                console.log(`        🤖 ${r.author}: ${r.body.slice(0, 80)}${r.body.length > 80 ? "..." : ""}`);
              }
            }
            needsAction++;
          }

          if (status.state === "OPEN" && status.ciStatus) {
            if (status.ciStatus === "FAILURE") {
              console.log(`     ❌ CI failing — fix needed!`);
              needsAction++;
            } else if (status.ciStatus === "PENDING") {
              console.log(`     ⏳ CI running...`);
            }
          }

          if (prOwner && prRepo && entry.pr_number) {
            try {
              const prComments = gh.getIssueComments(prOwner, prRepo, entry.pr_number);
              const humanPrComments = prComments.filter((c: any) => !isBot(c.author));
              if (humanPrComments.length > 0) {
                console.log(`     👤 ${humanPrComments.length} PR comment(s) from humans:`);
                for (const c of humanPrComments.slice(0, 3)) {
                  console.log(`        ${c.author}: ${c.body.slice(0, 80)}${c.body.length > 80 ? "..." : ""}`);
                }
              }
            } catch {}
          }

          if (entry.issue_number && prOwner && prRepo) {
            try {
              const issueComments = gh.getIssueComments(prOwner, prRepo, entry.issue_number);
              const humanIssueComments = issueComments.filter((c: any) => !isBot(c.author));
              if (humanIssueComments.length > 0) {
                console.log(`     📋 Issue #${entry.issue_number} has ${humanIssueComments.length} human comment(s):`);
                for (const c of humanIssueComments.slice(0, 3)) {
                  console.log(`        ${c.author}: ${c.body.slice(0, 80)}${c.body.length > 80 ? "..." : ""}`);
                }
              }
            } catch {}
          }

          if (status.state === "MERGED") merged++;
          else if (status.state === "CLOSED") closed++;
          else open++;
        } catch (e: any) {
          console.log(`  ⚠️  [PR] ${entry.company_name}#${entry.issue_number} PR #${entry.pr_number} — failed to check`);
        }
      }

      for (const entry of issueEntries) {
        try {
          const [repoOwner, repoName] = (entry.output_repo || "").split("/");
          if (!repoOwner || !repoName) continue;
          const issueData = gh.getIssueStatus(repoOwner, repoName, entry.output_number!);
          const newStatus = issueData.state === "closed" ? "closed"
            : issueData.hasLinkedPR ? "adopted"
            : issueData.hasNonAuthorComment ? "discussing"
            : "open";
          svc.updateOutputStatus(entry.id, newStatus);

          const icon = newStatus === "adopted" ? "🎯"
            : newStatus === "discussing" ? "💬"
            : newStatus === "closed" ? "🔒"
            : "🔵";
          console.log(`  ${icon} [Issue] ${entry.output_repo}#${entry.output_number} — ${newStatus}${issueData.comments > 0 ? ` (${issueData.comments} comments)` : ""}`);

          if (newStatus === "adopted") issueAdopted++;
          else if (newStatus === "closed") issueClosed++;
          else issueOpen++;
        } catch (e: any) {
          const msg = String(e.message || e);
          if (msg.includes("Could not resolve")) {
            svc.updateOutputStatus(entry.id, "deleted");
            console.log(`  🗑️  [Issue] ${entry.output_repo}#${entry.output_number} — deleted`);
            issueClosed++;
          } else {
            console.log(`  ⚠️  [Issue] ${entry.output_repo}#${entry.output_number} — failed to check`);
          }
        }
      }

      if (newlyFinalized.length > 0) {
        console.log(`\n🎉 Newly finalized since last sync:\n`);
        for (const { entry, state } of newlyFinalized) {
          let prOwner = "", prRepo = "";
          if (entry.company_name) {
            [prOwner, prRepo] = entry.company_name.split("/");
          }
          if ((!prOwner || !prRepo) && entry.pr_url) {
            const m = entry.pr_url.match(/github\.com\/([^/]+)\/([^/]+)\/pull/);
            if (m) { prOwner = m[1]; prRepo = m[2]; }
          }
          const displayName = prOwner && prRepo ? prOwner + "/" + prRepo : entry.company_name || entry.output_repo || "?";
          const icon = state === "MERGED" ? "✅" : "❌";
          console.log(`  ${icon} ${displayName}#${entry.issue_number || '?'} PR #${entry.pr_number} — ${state}`);
        }
      }

      console.log(`\n📊 Summary:`);
      if (prEntries.length > 0) {
        console.log(`  PRs: ${merged} merged | ${open} open | ${closed} closed${needsAction > 0 ? ` | ${needsAction} need action ⚠️` : ""}`);
      }
      if (issueEntries.length > 0) {
        console.log(`  Issues: ${issueAdopted} adopted | ${issueOpen} open | ${issueClosed} closed`);
      }
      if (newlyFinalized.length > 0) {
        const newMerged = newlyFinalized.filter(nf => nf.state === 'MERGED').length;
        const newClosed = newlyFinalized.filter(nf => nf.state === 'CLOSED').length;
        console.log(`  Newly finalized: ${newMerged} merged, ${newClosed} closed`);
      }
      console.log();
    });
}
