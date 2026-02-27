import type { ProjectRef } from "./types.js";

/** Parse relative duration strings like "7d", "30d", "2w" or ISO dates into a Date. */
export function parseSince(since: string): Date {
  const match = since.match(/^(\d+)([dwm])$/);
  if (match) {
    const [, amount, unit] = match;
    const n = parseInt(amount, 10);
    const now = new Date();
    switch (unit) {
      case "d":
        now.setDate(now.getDate() - n);
        return now;
      case "w":
        now.setDate(now.getDate() - n * 7);
        return now;
      case "m":
        now.setMonth(now.getMonth() - n);
        return now;
    }
  }
  // Try ISO date
  const d = new Date(since);
  if (!isNaN(d.getTime())) return d;
  // Fallback: 7 days ago
  const fallback = new Date();
  fallback.setDate(fallback.getDate() - 7);
  return fallback;
}

/** Wrap text in a standard MCP tool result. */
export function mcpText(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

/** Wrap an error message in a standard MCP tool result with isError flag. */
export function mcpError(msg: string) {
  return { content: [{ type: "text" as const, text: msg }], isError: true as const };
}

/** Resolve a project name to a ProjectRef by matching slug, full repo name, or path. */
export function resolveProject(
  name: string,
  projects: ProjectRef[],
): ProjectRef | null {
  const lower = name.toLowerCase();
  return (
    projects.find(
      (p) =>
        p.name.toLowerCase() === lower ||
        p.githubRepo?.toLowerCase() === lower ||
        p.localPath?.toLowerCase().endsWith(`/${lower}`),
    ) ?? null
  );
}

/** Derive a slug from a GitHub repo name or local path. */
export function slugify(input: string): string {
  // "owner/repo" → "repo"
  if (input.includes("/")) return input.split("/").pop()!.toLowerCase();
  // "/path/to/project" → "project"
  return input.split("/").pop()!.toLowerCase();
}
