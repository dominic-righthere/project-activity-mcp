import type { ProjectRef } from "../types.js";
import type { GitHubProvider } from "../providers/github.js";
import type { LocalGitProvider } from "../providers/local.js";
import { mcpText, mcpError } from "../utils.js";

export async function listProjects(
  projects: ProjectRef[],
  github: GitHubProvider | null,
  local: LocalGitProvider,
) {
  try {
    const results = await Promise.all(
      projects.map(async (p) => {
        let lastActivity: string | null = null;

        // Try local first (cheaper)
        if (p.localPath) {
          lastActivity = await local.getLastActivity(p.localPath);
        }

        // Try GitHub if no local activity found
        if (!lastActivity && p.githubRepo && github) {
          try {
            const commits = await github.getCommits(p.githubRepo, p.name, new Date(0), 1);
            if (commits.length > 0) lastActivity = commits[0].date;
          } catch {
            // Ignore
          }
        }

        return {
          name: p.name,
          github_repo: p.githubRepo ?? null,
          local_path: p.localPath ?? null,
          sources: p.sources,
          last_activity: lastActivity,
        };
      }),
    );

    return mcpText(JSON.stringify(results, null, 2));
  } catch (e) {
    return mcpError(`Failed to list projects: ${e}`);
  }
}
