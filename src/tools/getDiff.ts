import type { AppConfig, DiffResult, ProjectRef } from "../types.js";
import type { GitHubProvider } from "../providers/github.js";
import type { LocalGitProvider } from "../providers/local.js";
import { mcpText, mcpError, resolveProject } from "../utils.js";

/** Detect if a ref is a PR number, commit SHA, or tag. */
function detectRefType(ref: string): "pr" | "commit" | "tag" {
  // PR: starts with # or "PR" prefix, or is just a number
  if (/^#?\d+$/.test(ref) || /^pr[#-]?\d+$/i.test(ref)) return "pr";
  // SHA: hex string of 7+ characters
  if (/^[0-9a-f]{7,40}$/i.test(ref)) return "commit";
  // Default to tag
  return "tag";
}

/** Extract PR number from various formats: "42", "#42", "PR#42", "pr-42". */
function extractPRNumber(ref: string): number {
  const match = ref.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

export async function getDiff(
  args: { project: string; ref: string },
  projects: ProjectRef[],
  github: GitHubProvider | null,
  local: LocalGitProvider,
) {
  const proj = resolveProject(args.project, projects);
  if (!proj) return mcpError(`Project "${args.project}" not found.`);

  const refType = detectRefType(args.ref);

  const result: DiffResult = {
    ref: args.ref,
    refType,
    project: proj.name,
    files: [],
    stats: { additions: 0, deletions: 0, files_changed: 0 },
  };

  if (refType === "pr" && proj.githubRepo && github) {
    const prNum = extractPRNumber(args.ref);
    if (prNum === 0) return mcpError(`Invalid PR reference: "${args.ref}"`);

    result.files = await github.getPRDiff(proj.githubRepo, prNum);
  } else if (refType === "commit") {
    // Try GitHub first for URL
    if (proj.githubRepo && github) {
      result.files = await github.getCommitDiff(proj.githubRepo, args.ref);
    }
    // Fallback to local
    if (result.files.length === 0 && proj.localPath) {
      const stats = await local.getDiffStats(proj.localPath, args.ref);
      result.files = stats.map((s) => ({
        filename: s.filename,
        status: "modified",
        additions: s.additions,
        deletions: s.deletions,
      }));
    }
  } else {
    // Tag — try local diff against previous tag or HEAD
    if (proj.localPath) {
      const stats = await local.getDiffStats(proj.localPath, args.ref);
      result.files = stats.map((s) => ({
        filename: s.filename,
        status: "modified",
        additions: s.additions,
        deletions: s.deletions,
      }));
    } else if (proj.githubRepo && github) {
      // Try as a commit ref on GitHub
      result.files = await github.getCommitDiff(proj.githubRepo, args.ref);
    }
  }

  // Calculate stats
  result.stats = {
    files_changed: result.files.length,
    additions: result.files.reduce((sum, f) => sum + f.additions, 0),
    deletions: result.files.reduce((sum, f) => sum + f.deletions, 0),
  };

  return mcpText(JSON.stringify(result, null, 2));
}
