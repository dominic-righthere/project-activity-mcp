import { z } from "zod";

// ── Activity schema ──────────────────────────────────────────────────
export const ActivitySchema = z.object({
  id: z.string(),
  project: z.string(),
  source: z.enum(["github", "local"]),
  type: z.enum(["commit", "pr", "issue", "release", "discussion", "action", "branch", "tag"]),
  title: z.string(),
  body: z.string(),
  author: z.string(),
  date: z.string(), // ISO 8601
  url: z.string().optional(),
  metadata: z.object({
    files_changed: z.number().optional(),
    additions: z.number().optional(),
    deletions: z.number().optional(),
    labels: z.array(z.string()).optional(),
    state: z.enum(["open", "closed", "merged"]).optional(),
    milestone: z.string().optional(),
  }),
});

export type Activity = z.infer<typeof ActivitySchema>;

// ── Config ───────────────────────────────────────────────────────────
export interface GithubConfig {
  token_env?: string;
  repos: string[]; // "owner/repo" format
}

export interface LocalConfig {
  paths: string[];
}

export interface DefaultsConfig {
  since: string;
  limit: number;
}

export interface AppConfig {
  github?: GithubConfig;
  local?: LocalConfig;
  defaults: DefaultsConfig;
}

// ── ProjectRef ───────────────────────────────────────────────────────
export interface ProjectRef {
  name: string; // slug (e.g. "sonde")
  githubRepo?: string; // "owner/repo"
  localPath?: string; // absolute path
  sources: ("github" | "local")[];
}

// ── Narrative grouping ───────────────────────────────────────────────
export interface NarrativeGroup {
  label: string;
  commits: Activity[];
  summary: string;
}

// ── Diff result ──────────────────────────────────────────────────────
export interface DiffResult {
  ref: string;
  refType: "commit" | "pr" | "tag";
  project: string;
  files: DiffFile[];
  stats: { additions: number; deletions: number; files_changed: number };
}

export interface DiffFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

// ── Issue / PR details ───────────────────────────────────────────────
export interface IssueDetails {
  number: number;
  title: string;
  body: string;
  state: string;
  author: string;
  labels: string[];
  assignees: string[];
  milestone?: string;
  created_at: string;
  closed_at?: string;
  url: string;
}

export interface PRDetails {
  number: number;
  title: string;
  body: string;
  state: string;
  author: string;
  labels: string[];
  reviewers: string[];
  merged: boolean;
  merged_at?: string;
  url: string;
  additions: number;
  deletions: number;
  changed_files: number;
}

// ── Context tool results ─────────────────────────────────────────────
export interface IssueContext {
  issue: IssueDetails;
  linked_prs: { pr: PRDetails; commits: Activity[]; diff_summary: DiffFile[] }[];
  timeline: { date: string; event: string; detail: string }[];
}

export interface PRContext {
  pr: PRDetails;
  linked_issues: IssueDetails[];
  commits: Activity[];
  diff: { files: DiffFile[]; stats: { additions: number; deletions: number; files_changed: number } };
}

export interface CrossProjectActivity {
  period: { since: string; until: string };
  projects: { name: string; activities: Activity[] }[];
  summary: { total_commits: number; prs_merged: number; issues_closed: number };
}

// ── Repo summary ─────────────────────────────────────────────────────
export interface RepoSummary {
  name: string;
  description: string;
  language: string;
  stars: number;
  forks: number;
  open_issues: number;
  commits_last_week: number;
  top_contributors: { login: string; contributions: number }[];
  latest_release?: { tag: string; name: string; date: string };
  default_branch: string;
}
