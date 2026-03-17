import type { IssueContext, ProjectRef } from "../types.js";
import type { GitHubProvider } from "../providers/github.js";
import { mcpText, mcpError, resolveProject } from "../utils.js";

export async function getIssueContext(
  args: { project: string; issue: number },
  projects: ProjectRef[],
  github: GitHubProvider | null,
) {
  const proj = resolveProject(args.project, projects);
  if (!proj) return mcpError(`Project "${args.project}" not found. Use list_projects to see available projects.`);
  if (!proj.githubRepo || !github) return mcpError(`Project "${proj.name}" has no GitHub repo configured.`);

  const repo = proj.githubRepo;

  // 1. Get issue details
  const issue = await github.getIssueDetails(repo, args.issue);
  if (!issue) return mcpError(`Issue #${args.issue} not found in ${repo}.`);

  // 2. Find linked PRs
  const linkedPRNumbers = await github.findLinkedPRs(repo, args.issue);

  // 3. For each linked PR, get details, commits, and diff summary
  const linked_prs: IssueContext["linked_prs"] = [];
  for (const prNum of linkedPRNumbers) {
    const [pr, commits, diff_summary] = await Promise.all([
      github.getPRDetails(repo, prNum),
      github.getPRCommits(repo, proj.name, prNum),
      github.getPRDiff(repo, prNum),
    ]);
    if (pr) {
      // Strip patches from diff summary — just stats
      const summary = diff_summary.map(({ patch, ...rest }) => rest);
      linked_prs.push({ pr, commits, diff_summary: summary });
    }
  }

  // 4. Build timeline from all events
  const timeline: IssueContext["timeline"] = [];

  timeline.push({
    date: issue.created_at,
    event: "issue_opened",
    detail: `Issue #${issue.number} opened: ${issue.title}`,
  });

  if (issue.closed_at) {
    timeline.push({
      date: issue.closed_at,
      event: "issue_closed",
      detail: `Issue #${issue.number} closed`,
    });
  }

  for (const { pr, commits } of linked_prs) {
    timeline.push({
      date: pr.merged_at ?? pr.url, // fallback doesn't matter — we check merged
      event: pr.merged ? "pr_merged" : "pr_opened",
      detail: `PR #${pr.number}: ${pr.title}`,
    });

    for (const c of commits) {
      timeline.push({
        date: c.date,
        event: "commit",
        detail: `${c.id.slice(0, 7)}: ${c.title}`,
      });
    }
  }

  // Sort timeline chronologically
  timeline.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const result: IssueContext = { issue, linked_prs, timeline };
  return mcpText(JSON.stringify(result, null, 2));
}
