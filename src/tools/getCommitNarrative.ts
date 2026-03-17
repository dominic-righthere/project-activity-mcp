import type { Activity, AppConfig, NarrativeGroup, ProjectRef } from "../types.js";
import type { GitHubProvider } from "../providers/github.js";
import type { LocalGitProvider } from "../providers/local.js";
import { parseSince, mcpText, mcpError, resolveProject } from "../utils.js";

const NOISE_PATTERNS = [
  /^fix(ed)?\s*(typo|lint|format|style|whitespace)/i,
  /^wip$/i,
  /^minor$/i,
  /^update$/i,
  /^cleanup$/i,
  /^nit$/i,
  /^tmp$/i,
  /^todo$/i,
];

function isNoise(msg: string): boolean {
  const first = msg.split("\n")[0].trim();
  return NOISE_PATTERNS.some((p) => p.test(first));
}

function groupByDay(commits: Activity[]): NarrativeGroup[] {
  const days = new Map<string, Activity[]>();
  for (const c of commits) {
    const day = c.date.split("T")[0];
    const existing = days.get(day) ?? [];
    existing.push(c);
    days.set(day, existing);
  }

  return Array.from(days.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([day, dayCommits]) => {
      const meaningful = dayCommits.filter((c) => !isNoise(c.title));
      const noiseCount = dayCommits.length - meaningful.length;
      const summary =
        meaningful.map((c) => `- ${c.title}`).join("\n") +
        (noiseCount > 0 ? `\n- ...and ${noiseCount} minor fixes` : "");
      return { label: day, commits: dayCommits, summary };
    });
}

function groupByAuthor(commits: Activity[]): NarrativeGroup[] {
  const authors = new Map<string, Activity[]>();
  for (const c of commits) {
    const existing = authors.get(c.author) ?? [];
    existing.push(c);
    authors.set(c.author, existing);
  }

  return Array.from(authors.entries())
    .sort(([, a], [, b]) => b.length - a.length)
    .map(([author, authorCommits]) => {
      const meaningful = authorCommits.filter((c) => !isNoise(c.title));
      const noiseCount = authorCommits.length - meaningful.length;
      const summary =
        meaningful.map((c) => `- ${c.title}`).join("\n") +
        (noiseCount > 0 ? `\n- ...and ${noiseCount} minor fixes` : "");
      return { label: author, commits: authorCommits, summary };
    });
}

function groupByPR(commits: Activity[], prs: Activity[]): NarrativeGroup[] {
  const groups: NarrativeGroup[] = [];
  const groupedIds = new Set<string>();

  for (const pr of prs) {
    const prNum = pr.id.replace("pr-", "");
    const related = commits.filter(
      (c) => c.body.includes(`#${prNum}`) || c.title.includes(`#${prNum}`),
    );
    if (related.length > 0) {
      groups.push({
        label: `PR #${prNum}: ${pr.title}`,
        commits: related,
        summary: `${pr.title}\n${related.map((c) => `  - ${c.title}`).join("\n")}`,
      });
      for (const r of related) groupedIds.add(r.id);
    }
  }

  // Remaining commits go into "Other changes"
  const remaining = commits.filter((c) => !groupedIds.has(c.id));
  if (remaining.length > 0) {
    const meaningful = remaining.filter((c) => !isNoise(c.title));
    const noiseCount = remaining.length - meaningful.length;
    groups.push({
      label: "Other changes",
      commits: remaining,
      summary:
        meaningful.map((c) => `- ${c.title}`).join("\n") +
        (noiseCount > 0 ? `\n- ...and ${noiseCount} minor fixes` : ""),
    });
  }

  return groups;
}

export async function getCommitNarrative(
  args: { project: string; since?: string; group_by?: string },
  projects: ProjectRef[],
  config: AppConfig,
  github: GitHubProvider | null,
  local: LocalGitProvider,
) {
  const proj = resolveProject(args.project, projects);
  if (!proj) return mcpError(`Project "${args.project}" not found.`);

  const since = parseSince(args.since ?? config.defaults.since);
  const groupBy = args.group_by ?? "day";

  // Fetch commits from both sources
  const allCommits: Activity[] = [];
  const allPRs: Activity[] = [];

  if (proj.githubRepo && github) {
    const [commits, prs] = await Promise.all([
      github.getCommits(proj.githubRepo, proj.name, since, 100),
      github.getPullRequests(proj.githubRepo, proj.name, since, 50),
    ]);
    allCommits.push(...commits);
    allPRs.push(...prs);
  }

  if (proj.localPath) {
    const localCommits = await local.getCommits(proj.localPath, proj.name, since, 100);
    allCommits.push(...localCommits);
  }

  // Deduplicate by SHA
  const seen = new Set<string>();
  const deduped = allCommits.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });

  // Sort by date descending
  deduped.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  let groups: NarrativeGroup[];
  switch (groupBy) {
    case "author":
      groups = groupByAuthor(deduped);
      break;
    case "pr":
      groups = groupByPR([...deduped], allPRs);
      break;
    case "day":
    default:
      groups = groupByDay(deduped);
      break;
  }

  return mcpText(
    JSON.stringify(
      {
        project: proj.name,
        since: since.toISOString(),
        group_by: groupBy,
        total_commits: deduped.length,
        groups: groups.map((g) => ({
          label: g.label,
          commit_count: g.commits.length,
          summary: g.summary,
        })),
      },
      null,
      2,
    ),
  );
}
