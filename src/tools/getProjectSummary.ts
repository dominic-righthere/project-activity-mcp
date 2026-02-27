import type { AppConfig, ProjectRef } from "../types.js";
import type { GitHubProvider } from "../providers/github.js";
import type { LocalGitProvider } from "../providers/local.js";
import { mcpText, mcpError, resolveProject } from "../utils.js";

export async function getProjectSummary(
  args: { project: string },
  projects: ProjectRef[],
  github: GitHubProvider | null,
  local: LocalGitProvider,
) {
  const proj = resolveProject(args.project, projects);
  if (!proj) return mcpError(`Project "${args.project}" not found.`);

  const summary: Record<string, any> = {
    name: proj.name,
    sources: proj.sources,
  };

  // GitHub summary
  if (proj.githubRepo && github) {
    const repoInfo = await github.getRepoInfo(proj.githubRepo);
    if (repoInfo) {
      summary.github = {
        full_name: repoInfo.name,
        description: repoInfo.description,
        language: repoInfo.language,
        stars: repoInfo.stars,
        forks: repoInfo.forks,
        open_issues: repoInfo.open_issues,
        commits_last_week: repoInfo.commits_last_week,
        top_contributors: repoInfo.top_contributors,
        latest_release: repoInfo.latest_release,
        default_branch: repoInfo.default_branch,
      };
    }
  }

  // Local summary
  if (proj.localPath) {
    const [lastActivity, branches, tags] = await Promise.all([
      local.getLastActivity(proj.localPath),
      local.getBranches(proj.localPath, proj.name),
      local.getTags(proj.localPath, proj.name, 5),
    ]);

    summary.local = {
      path: proj.localPath,
      last_activity: lastActivity,
      branch_count: branches.length,
      recent_branches: branches.slice(0, 5).map((b) => b.title),
      recent_tags: tags.map((t) => t.title),
    };
  }

  return mcpText(JSON.stringify(summary, null, 2));
}
