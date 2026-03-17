import type { PRContext, IssueDetails, ProjectRef } from "../types.js";
import type { GitHubProvider } from "../providers/github.js";
import { mcpText, mcpError, resolveProject } from "../utils.js";

/** Extract issue numbers from PR body using common linking patterns. */
function parseLinkedIssues(body: string): number[] {
  const patterns = [
    /(?:fix|fixes|fixed|close|closes|closed|resolve|resolves|resolved)\s+#(\d+)/gi,
    /(?:fix|fixes|fixed|close|closes|closed|resolve|resolves|resolved)\s+(?:https?:\/\/github\.com\/[^/]+\/[^/]+\/issues\/)(\d+)/gi,
  ];
  const numbers = new Set<number>();
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(body)) !== null) {
      numbers.add(parseInt(match[1], 10));
    }
  }
  return Array.from(numbers);
}

export async function getPRContext(
  args: { project: string; pr: number; include_diff?: boolean },
  projects: ProjectRef[],
  github: GitHubProvider | null,
) {
  const proj = resolveProject(args.project, projects);
  if (!proj) return mcpError(`Project "${args.project}" not found. Use list_projects to see available projects.`);
  if (!proj.githubRepo || !github) return mcpError(`Project "${proj.name}" has no GitHub repo configured.`);

  const repo = proj.githubRepo;
  const includeDiff = args.include_diff ?? false;

  // 1. Get PR details
  const pr = await github.getPRDetails(repo, args.pr);
  if (!pr) return mcpError(`PR #${args.pr} not found in ${repo}.`);

  // 2. Get commits and diff in parallel
  const [commits, diffFiles] = await Promise.all([
    github.getPRCommits(repo, proj.name, args.pr),
    github.getPRDiff(repo, args.pr),
  ]);

  // 3. Parse linked issues from PR body and fetch their details
  const issueNumbers = parseLinkedIssues(pr.body);
  const linked_issues: IssueDetails[] = [];
  const issueResults = await Promise.all(
    issueNumbers.map((n) => github.getIssueDetails(repo, n)),
  );
  for (const issue of issueResults) {
    if (issue) linked_issues.push(issue);
  }

  // 4. Build diff — strip patches unless requested
  const files = includeDiff
    ? diffFiles
    : diffFiles.map(({ patch, ...rest }) => rest);

  const stats = {
    additions: diffFiles.reduce((sum, f) => sum + f.additions, 0),
    deletions: diffFiles.reduce((sum, f) => sum + f.deletions, 0),
    files_changed: diffFiles.length,
  };

  const result: PRContext = { pr, linked_issues, commits, diff: { files, stats } };
  return mcpText(JSON.stringify(result, null, 2));
}
