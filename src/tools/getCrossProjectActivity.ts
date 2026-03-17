import type { Activity, AppConfig, CrossProjectActivity, ProjectRef } from "../types.js";
import type { GitHubProvider } from "../providers/github.js";
import type { LocalGitProvider } from "../providers/local.js";
import { parseSince, mcpText, mcpError, resolveProject } from "../utils.js";

export async function getCrossProjectActivity(
  args: { projects: string; since?: string; types?: string[] },
  allProjects: ProjectRef[],
  config: AppConfig,
  github: GitHubProvider | null,
  local: LocalGitProvider,
) {
  const since = parseSince(args.since ?? config.defaults.since);
  const limit = config.defaults.limit;
  const types = args.types ?? ["commits", "prs", "issues", "releases"];

  // Resolve which projects to query
  let targetProjects: ProjectRef[];
  if (args.projects.toLowerCase() === "all") {
    targetProjects = allProjects;
  } else {
    const names = args.projects.split(",").map((s) => s.trim());
    targetProjects = [];
    for (const name of names) {
      const proj = resolveProject(name, allProjects);
      if (!proj) return mcpError(`Project "${name}" not found. Use list_projects to see available projects.`);
      targetProjects.push(proj);
    }
  }

  if (targetProjects.length === 0) {
    return mcpError("No projects configured. Use list_projects to check.");
  }

  // Fetch activity for each project in parallel
  const projectResults = await Promise.all(
    targetProjects.map(async (proj) => {
      const activities: Activity[] = [];

      if (proj.githubRepo && github) {
        const repo = proj.githubRepo;
        const fetches: Promise<Activity[]>[] = [];
        if (types.includes("commits")) fetches.push(github.getCommits(repo, proj.name, since, limit));
        if (types.includes("prs")) fetches.push(github.getPullRequests(repo, proj.name, since, limit));
        if (types.includes("issues")) fetches.push(github.getIssues(repo, proj.name, since, limit));
        if (types.includes("releases")) fetches.push(github.getReleases(repo, proj.name, since, limit));
        if (types.includes("discussions")) fetches.push(github.getDiscussions(repo, proj.name, since, limit));
        if (types.includes("actions")) fetches.push(github.getActions(repo, proj.name, since, limit));
        const results = await Promise.all(fetches);
        activities.push(...results.flat());
      }

      if (proj.localPath && types.includes("commits")) {
        const localCommits = await local.getCommits(proj.localPath, proj.name, since, limit);
        activities.push(...localCommits);
      }

      // Deduplicate commits — prefer GitHub version
      const seen = new Map<string, Activity>();
      for (const a of activities) {
        const key = a.type === "commit" ? a.id : `${a.type}-${a.id}`;
        const existing = seen.get(key);
        if (!existing || (a.source === "github" && existing.source === "local")) {
          seen.set(key, a);
        }
      }

      const deduped = Array.from(seen.values()).sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      );

      return { name: proj.name, activities: deduped };
    }),
  );

  // Build summary
  const allActivities = projectResults.flatMap((p) => p.activities);
  const summary = {
    total_commits: allActivities.filter((a) => a.type === "commit").length,
    prs_merged: allActivities.filter((a) => a.type === "pr" && a.metadata.state === "merged").length,
    issues_closed: allActivities.filter((a) => a.type === "issue" && a.metadata.state === "closed").length,
  };

  const result: CrossProjectActivity = {
    period: { since: since.toISOString(), until: new Date().toISOString() },
    projects: projectResults,
    summary,
  };

  return mcpText(JSON.stringify(result, null, 2));
}
