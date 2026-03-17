import type { Activity, AppConfig, ProjectRef } from "../types.js";
import type { GitHubProvider } from "../providers/github.js";
import type { LocalGitProvider } from "../providers/local.js";
import { parseSince, mcpText, mcpError, resolveProject } from "../utils.js";

const VALID_TYPES = ["commits", "prs", "issues", "releases", "discussions", "actions"] as const;

export async function getActivity(
  args: { project: string; since?: string; types?: string[]; limit?: number },
  projects: ProjectRef[],
  config: AppConfig,
  github: GitHubProvider | null,
  local: LocalGitProvider,
) {
  const proj = resolveProject(args.project, projects);
  if (!proj) return mcpError(`Project "${args.project}" not found. Use list_projects to see available projects.`);

  const since = parseSince(args.since ?? config.defaults.since);
  const limit = args.limit ?? config.defaults.limit;
  const requested = args.types ?? ["commits", "prs", "issues", "releases"];
  const types = requested.filter((t) => (VALID_TYPES as readonly string[]).includes(t));

  const activities: Activity[] = [];

  // GitHub activities
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

  // Local activities
  if (proj.localPath) {
    if (types.includes("commits")) {
      const localCommits = await local.getCommits(proj.localPath, proj.name, since, limit);
      activities.push(...localCommits);
    }
  }

  // Deduplicate commits by SHA — prefer GitHub version (has URL)
  const seen = new Map<string, Activity>();
  for (const a of activities) {
    const key = a.type === "commit" ? a.id : `${a.type}-${a.id}`;
    const existing = seen.get(key);
    if (!existing || (a.source === "github" && existing.source === "local")) {
      seen.set(key, a);
    }
  }

  // Sort by date descending
  const deduped = Array.from(seen.values()).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  // Apply limit
  const limited = deduped.slice(0, limit);

  return mcpText(
    JSON.stringify(
      {
        project: proj.name,
        since: since.toISOString(),
        total: limited.length,
        activities: limited,
      },
      null,
      2,
    ),
  );
}
