#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfig, deriveProjects, resolveToken } from "./config.js";
import { GitHubProvider } from "./providers/github.js";
import { LocalGitProvider } from "./providers/local.js";
import { listProjects } from "./tools/listProjects.js";
import { getActivity } from "./tools/getActivity.js";
import { getCommitNarrative } from "./tools/getCommitNarrative.js";
import { getProjectSummary } from "./tools/getProjectSummary.js";
import { getDiff } from "./tools/getDiff.js";
import { getIssueContext } from "./tools/getIssueContext.js";
import { getPRContext } from "./tools/getPRContext.js";
import { getCrossProjectActivity } from "./tools/getCrossProjectActivity.js";

async function main() {
  const config = loadConfig();
  const projects = deriveProjects(config);
  const token = resolveToken(config);
  const github = token ? new GitHubProvider(token) : config.github?.repos?.length ? new GitHubProvider() : null;
  const local = new LocalGitProvider();

  const server = new McpServer({
    name: "project-activity",
    version: "1.0.0",
  });

  // ── list_projects ────────────────────────────────────────────────
  server.registerTool(
    "list_projects",
    {
      description:
        "List all configured projects (GitHub repos + local paths) with last-activity timestamps.",
      inputSchema: z.object({}),
    },
    async () => listProjects(projects, github, local),
  );

  // ── get_activity ─────────────────────────────────────────────────
  server.registerTool(
    "get_activity",
    {
      description:
        "Get a structured activity feed for a project, merging GitHub and local git data. Returns commits, PRs, issues, releases, discussions, and actions sorted by recency.",
      inputSchema: z.object({
        project: z.string().describe("Project name, repo slug, or full owner/repo"),
        since: z
          .string()
          .optional()
          .describe('How far back to look — "7d", "30d", "2w", or ISO date'),
        types: z
          .array(z.string())
          .optional()
          .describe('Activity types to include: "commits", "prs", "issues", "releases", "discussions", "actions"'),
        limit: z.number().optional().describe("Max items to return (default: 20)"),
      }),
    },
    async (args) => getActivity(args, projects, config, github, local),
  );

  // ── get_commit_narrative ─────────────────────────────────────────
  server.registerTool(
    "get_commit_narrative",
    {
      description:
        "Group raw commits into logical changesets. Collapses noise (typo/wip/minor chains) and groups by day, PR, or author. Returns summaries suitable for expanding into prose.",
      inputSchema: z.object({
        project: z.string().describe("Project name or slug"),
        since: z.string().optional().describe('How far back — "7d", "30d", or ISO date'),
        group_by: z
          .enum(["day", "pr", "author"])
          .optional()
          .describe("How to group commits (default: day)"),
      }),
    },
    async (args) => getCommitNarrative(args, projects, config, github, local),
  );

  // ── get_project_summary ──────────────────────────────────────────
  server.registerTool(
    "get_project_summary",
    {
      description:
        "Get high-level project context: description, language, stars, velocity, top contributors, open issues, latest release, and local branch info.",
      inputSchema: z.object({
        project: z.string().describe("Project name or slug"),
      }),
    },
    async (args) => getProjectSummary(args, projects, github, local),
  );

  // ── get_diff ─────────────────────────────────────────────────────
  server.registerTool(
    "get_diff",
    {
      description:
        "Get the code diff for a specific commit SHA, PR number, or tag. Returns file-level changes with additions, deletions, and patches.",
      inputSchema: z.object({
        project: z.string().describe("Project name or slug"),
        ref: z
          .string()
          .describe('Commit SHA, PR number (e.g. "#42" or "42"), or tag name'),
      }),
    },
    async (args) => getDiff(args, projects, github, local),
  );

  // ── get_issue_context ────────────────────────────────────────────
  server.registerTool(
    "get_issue_context",
    {
      description:
        "Get the full context of a GitHub issue: details, linked PRs, commits, diff summaries, and timeline. Ideal for writing about a bug or feature.",
      inputSchema: z.object({
        project: z.string().describe("Project name or slug"),
        issue: z.number().describe("Issue number"),
      }),
    },
    async (args) => getIssueContext(args, projects, github),
  );

  // ── get_pr_context ──────────────────────────────────────────────
  server.registerTool(
    "get_pr_context",
    {
      description:
        "Get the full context of a pull request: details, linked issues, commits, and diff. Everything needed to write about a code change or feature.",
      inputSchema: z.object({
        project: z.string().describe("Project name or slug"),
        pr: z.number().describe("Pull request number"),
        include_diff: z
          .boolean()
          .optional()
          .describe("Include file patches in diff (default: false, just stats)"),
      }),
    },
    async (args) => getPRContext(args, projects, github),
  );

  // ── get_cross_project_activity ──────────────────────────────────
  server.registerTool(
    "get_cross_project_activity",
    {
      description:
        'Aggregated activity across multiple projects. Perfect for weekly journals, recaps, or "what I shipped" summaries.',
      inputSchema: z.object({
        projects: z
          .string()
          .describe('Comma-separated project names, or "all" for every configured project'),
        since: z
          .string()
          .optional()
          .describe('How far back to look — "7d", "30d", "2w", or ISO date'),
        types: z
          .array(z.string())
          .optional()
          .describe('Activity types to include: "commits", "prs", "issues", "releases", "discussions", "actions"'),
      }),
    },
    async (args) => getCrossProjectActivity(args, projects, config, github, local),
  );

  // ── Start ────────────────────────────────────────────────────────
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("project-activity-mcp server running on stdio");
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
