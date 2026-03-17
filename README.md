# project-activity-mcp

An MCP server that aggregates GitHub and local git activity, giving AI assistants structured context to draft blog posts, changelogs, release notes, and project updates.

## Installation

```bash
npx project-activity-mcp
```

Or install globally:

```bash
npm install -g project-activity-mcp
```

### Claude Code

```bash
claude mcp add project-activity -- npx project-activity-mcp
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "project-activity": {
      "command": "npx",
      "args": ["project-activity-mcp"]
    }
  }
}
```

## Configuration

Create `~/.config/project-activity-mcp/config.yaml`:

```yaml
github:
  token_env: GITHUB_TOKEN   # env var containing your token (default: GITHUB_TOKEN)
  repos:
    - your-org/your-repo
    - your-org/another-repo

local:
  paths:
    - ~/work/projects/your-repo
    - ~/work/projects/another-repo

defaults:
  since: 7d     # default lookback window
  limit: 20     # default max items per fetch
```

`GITHUB_TOKEN` needs `repo` scope (read-only is fine for public repos; private repos require full `repo`).

## Tools

### `list_projects`
Lists all configured projects with last-activity timestamps.

### `get_activity`
Returns a structured activity feed for a project, merging GitHub and local git data.

```
project  — project name or slug
since    — "7d", "30d", "2w", or ISO date (default: 7d)
types    — ["commits", "prs", "issues", "releases", "discussions", "actions"]
limit    — max items (default: 20)
```

### `get_commit_narrative`
Groups commits into logical changesets, collapsing noise (typos, wip, minor fixes). Returns summaries suitable for expanding into prose.

```
project   — project name or slug
since     — how far back (default: 7d)
group_by  — "day" | "pr" | "author" (default: day)
```

### `get_project_summary`
High-level project context: description, language, stars, velocity, contributors, open issues, latest release.

```
project  — project name or slug
```

### `get_diff`
Code diff for a commit SHA, PR number, or tag.

```
project  — project name or slug
ref      — commit SHA, PR number (e.g. "42" or "#42"), or tag name
```

### `get_issue_context`
Full lifecycle of an issue: details, linked PRs, commits in those PRs, diff summaries, and a chronological timeline. One call instead of four.

```
project  — project name or slug
issue    — issue number
```

### `get_pr_context`
Complete PR story: details, linked issues (parsed from body), commits, and diff.

```
project       — project name or slug
pr            — pull request number
include_diff  — include file patches (default: false, just stats)
```

### `get_cross_project_activity`
Aggregated activity across all or selected projects. For weekly journals, recaps, or "what I shipped" summaries.

```
projects  — comma-separated project names, or "all"
since     — how far back (default: 7d)
types     — activity types to include
```

## Example usage

> "What did I ship this week across all my projects? Write a short blog post about the highlights."

The AI calls `get_cross_project_activity(projects: "all", since: "7d")` and gets a unified feed with summary counts to work from.

> "Write release notes for PR #42 in my-project."

The AI calls `get_pr_context(project: "my-project", pr: 42)` and gets the PR description, linked issues, all commits, and file-level diff stats.

## License

MIT
