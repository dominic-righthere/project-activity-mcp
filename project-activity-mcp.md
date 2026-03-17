# MCP Server: Project Activity Discovery

## Purpose

An MCP server that aggregates activity from GitHub repos and local git projects, giving AI assistants structured context to draft blog posts, changelogs, release notes, and project updates.

---

## Data Sources

### GitHub (via `gh` CLI / GitHub API)

| Signal | API | What it captures |
|--------|-----|------------------|
| Commits | `GET /repos/{owner}/{repo}/commits` | Code changes, messages, authors, diffs |
| Pull Requests | `GET /repos/{owner}/{repo}/pulls` | Feature descriptions, review discussions, merge timelines |
| Issues | `GET /repos/{owner}/{repo}/issues` | Bug reports, feature requests, resolutions |
| Releases | `GET /repos/{owner}/{repo}/releases` | Versioned milestones, release notes |
| Discussions | `GET /repos/{owner}/{repo}/discussions` | Community Q&A, RFCs, announcements |
| Actions | `GET /repos/{owner}/{repo}/actions/runs` | CI/CD status, deploy frequency |

### Local Git (via `simple-git` or shell)

| Signal | Command | What it captures |
|--------|---------|------------------|
| Recent commits | `git log --since="7 days ago"` | Work-in-progress not yet pushed |
| Branch activity | `git branch -a --sort=-committerdate` | Active feature branches |
| Diff stats | `git diff --stat HEAD~N` | Scope of recent changes |
| Tags | `git tag --sort=-creatordate` | Local release markers |

---

## MCP Tools

### `list_projects`
Returns all configured projects (GitHub repos + local paths) with last-activity timestamps.

### `get_activity`
```
params:
  project: string        # repo name or local path
  since: string          # ISO date or relative ("7d", "30d")
  types: string[]        # ["commits", "prs", "issues", "releases"]
  limit: number          # max items per type (default: 20)
```
Returns structured activity feed sorted by recency.

### `get_commit_narrative`
```
params:
  project: string
  since: string
  group_by: "day" | "pr" | "author"
```
Groups raw commits into logical changesets. Collapses "fix typo" chains. Returns summaries suitable for AI to expand into prose.

### `get_project_summary`
```
params:
  project: string
```
Returns high-level project context: description, language, stars, recent velocity (commits/week), top contributors, open issue count, latest release.

### `get_diff`
```
params:
  project: string
  ref: string            # commit SHA, PR number, or tag
```
Returns the actual code diff with file-level summaries. Useful when the AI needs to understand *what* changed, not just *that* something changed.

---

## Configuration

`~/.config/project-activity-mcp/config.yaml`:

```yaml
github:
  token_env: GITHUB_TOKEN    # or use gh CLI auth
  repos:
    - your-org/your-repo
    - your-org/another-repo

local:
  paths:
    - ~/work/projects/your-repo
    - ~/work/projects/another-repo

defaults:
  since: 7d
  limit: 20
```

---

## Architecture

```
┌─────────────────────────────────────┐
│  AI Assistant (Claude Code, etc.)   │
└──────────────┬──────────────────────┘
               │ MCP protocol (stdio)
┌──────────────▼──────────────────────┐
│  project-activity-mcp               │
│                                     │
│  ┌───────────┐  ┌────────────────┐  │
│  │ GitHub    │  │ Local Git      │  │
│  │ Provider  │  │ Provider       │  │
│  └─────┬─────┘  └───────┬────────┘  │
│        │                │           │
│  ┌─────▼────────────────▼────────┐  │
│  │  Unified Activity Model       │  │
│  │  (normalize both sources      │  │
│  │   into common schema)         │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

---

## Unified Activity Schema

```typescript
interface Activity {
  id: string;
  project: string;
  source: "github" | "local";
  type: "commit" | "pr" | "issue" | "release" | "discussion";
  title: string;
  body: string;
  author: string;
  date: string;           // ISO 8601
  url?: string;           // GitHub URL if applicable
  metadata: {
    files_changed?: number;
    additions?: number;
    deletions?: number;
    labels?: string[];
    state?: "open" | "closed" | "merged";
    milestone?: string;
  };
}
```

---

## Tech Stack

| Component | Choice | Reason |
|-----------|--------|--------|
| Runtime | Node.js / TypeScript | Matches your blog stack, MCP SDK available |
| MCP SDK | `@modelcontextprotocol/sdk` | Official TypeScript SDK |
| GitHub | `@octokit/rest` or `gh` CLI | Auth handled, rate limiting built in |
| Local git | `simple-git` | Clean API over git CLI |
| Config | `yaml` + `zod` | Validation with good DX |

---

## Usage Flow

1. **Install**: `claude mcp add project-activity -- npx project-activity-mcp`
2. **Ask AI to write a post**:
   > "What happened in my-project this week? Draft a blog post about the highlights."
3. **AI calls** `get_activity(project: "my-project", since: "7d")` → gets structured feed
4. **AI calls** `get_diff(project: "my-project", ref: "PR#42")` → gets details on key changes
5. **AI writes** MDX post with real context, not hallucinated features

---

## Future Extensions

- **Cross-project correlation** — "What did I ship across all projects this month?"
- **Caching layer** — SQLite cache to avoid hitting GitHub API on every call
- **RSS/changelog generation** — Auto-generate feeds from activity
- **Webhook mode** — HTTP transport that listens for GitHub webhooks for real-time updates
