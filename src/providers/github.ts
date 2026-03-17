import { Octokit } from "@octokit/rest";
import type { Activity, DiffFile, IssueDetails, PRDetails, RepoSummary } from "../types.js";

export class GitHubProvider {
  private octokit: Octokit;

  constructor(token?: string) {
    this.octokit = new Octokit(token ? { auth: token } : undefined);
  }

  private split(repo: string): { owner: string; repo: string } {
    const parts = repo.split("/");
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new Error(`Invalid repo format "${repo}" — expected "owner/repo"`);
    }
    return { owner: parts[0], repo: parts[1] };
  }

  async getCommits(
    repo: string,
    project: string,
    since: Date,
    limit: number,
  ): Promise<Activity[]> {
    try {
      const { owner, repo: name } = this.split(repo);
      const { data } = await this.octokit.repos.listCommits({
        owner,
        repo: name,
        since: since.toISOString(),
        per_page: limit,
      });
      return data.map((c) => ({
        id: c.sha,
        project,
        source: "github" as const,
        type: "commit" as const,
        title: c.commit.message.split("\n")[0],
        body: c.commit.message,
        author: c.author?.login ?? c.commit.author?.name ?? "unknown",
        date: c.commit.author?.date ?? new Date().toISOString(),
        url: c.html_url,
        metadata: {
          files_changed: c.files?.length,
          additions: c.stats?.additions,
          deletions: c.stats?.deletions,
        },
      }));
    } catch (e) {
      console.error(`GitHub getCommits error for ${repo}:`, e);
      return [];
    }
  }

  async getPullRequests(
    repo: string,
    project: string,
    since: Date,
    limit: number,
  ): Promise<Activity[]> {
    try {
      const { owner, repo: name } = this.split(repo);
      const { data } = await this.octokit.pulls.list({
        owner,
        repo: name,
        state: "all",
        sort: "updated",
        direction: "desc",
        per_page: limit,
      });
      return data
        .filter((pr) => new Date(pr.updated_at) >= since)
        .map((pr) => ({
          id: `pr-${pr.number}`,
          project,
          source: "github" as const,
          type: "pr" as const,
          title: pr.title,
          body: pr.body ?? "",
          author: pr.user?.login ?? "unknown",
          date: pr.updated_at,
          url: pr.html_url,
          metadata: {
            state: (pr.merged_at ? "merged" : pr.state) as Activity["metadata"]["state"],
            labels: pr.labels.map((l) => (typeof l === "string" ? l : l.name ?? "")),
            milestone: pr.milestone?.title,
          },
        }));
    } catch (e) {
      console.error(`GitHub getPullRequests error for ${repo}:`, e);
      return [];
    }
  }

  async getIssues(
    repo: string,
    project: string,
    since: Date,
    limit: number,
  ): Promise<Activity[]> {
    try {
      const { owner, repo: name } = this.split(repo);
      const { data } = await this.octokit.issues.listForRepo({
        owner,
        repo: name,
        state: "all",
        sort: "updated",
        direction: "desc",
        since: since.toISOString(),
        per_page: limit,
      });
      // Filter out pull requests (GitHub API includes them in issues)
      return data
        .filter((i) => !i.pull_request)
        .map((i) => ({
          id: `issue-${i.number}`,
          project,
          source: "github" as const,
          type: "issue" as const,
          title: i.title,
          body: i.body ?? "",
          author: i.user?.login ?? "unknown",
          date: i.updated_at,
          url: i.html_url,
          metadata: {
            state: i.state as Activity["metadata"]["state"],
            labels: i.labels.map((l) => (typeof l === "string" ? l : l.name ?? "")),
            milestone: i.milestone?.title,
          },
        }));
    } catch (e) {
      console.error(`GitHub getIssues error for ${repo}:`, e);
      return [];
    }
  }

  async getReleases(
    repo: string,
    project: string,
    since: Date,
    limit: number,
  ): Promise<Activity[]> {
    try {
      const { owner, repo: name } = this.split(repo);
      const { data } = await this.octokit.repos.listReleases({
        owner,
        repo: name,
        per_page: limit,
      });
      return data
        .filter((r) => new Date(r.published_at ?? r.created_at) >= since)
        .map((r) => ({
          id: `release-${r.id}`,
          project,
          source: "github" as const,
          type: "release" as const,
          title: r.name ?? r.tag_name,
          body: r.body ?? "",
          author: r.author?.login ?? "unknown",
          date: r.published_at ?? r.created_at,
          url: r.html_url,
          metadata: {},
        }));
    } catch (e) {
      console.error(`GitHub getReleases error for ${repo}:`, e);
      return [];
    }
  }

  async getDiscussions(
    repo: string,
    project: string,
    since: Date,
    limit: number,
  ): Promise<Activity[]> {
    try {
      const { owner, repo: name } = this.split(repo);
      const query = `
        query($owner: String!, $name: String!, $limit: Int!) {
          repository(owner: $owner, name: $name) {
            discussions(first: $limit, orderBy: { field: UPDATED_AT, direction: DESC }) {
              nodes {
                id
                number
                title
                body
                author { login }
                updatedAt
                url
                category { name }
              }
            }
          }
        }
      `;
      const result: any = await this.octokit.graphql(query, {
        owner,
        name,
        limit,
      });
      const discussions = result.repository?.discussions?.nodes ?? [];
      return discussions
        .filter((d: any) => new Date(d.updatedAt) >= since)
        .map((d: any) => ({
          id: `discussion-${d.number}`,
          project,
          source: "github" as const,
          type: "discussion" as const,
          title: d.title,
          body: d.body ?? "",
          author: d.author?.login ?? "unknown",
          date: d.updatedAt,
          url: d.url,
          metadata: {
            labels: d.category ? [d.category.name] : [],
          },
        }));
    } catch (e) {
      console.error(`GitHub getDiscussions error for ${repo}:`, e);
      return [];
    }
  }

  async getActions(
    repo: string,
    project: string,
    since: Date,
    limit: number,
  ): Promise<Activity[]> {
    try {
      const { owner, repo: name } = this.split(repo);
      const { data } = await this.octokit.actions.listWorkflowRunsForRepo({
        owner,
        repo: name,
        created: `>=${since.toISOString().split("T")[0]}`,
        per_page: limit,
      });
      return data.workflow_runs.map((r) => ({
        id: `action-${r.id}`,
        project,
        source: "github" as const,
        type: "action" as const,
        title: `${r.name}: ${r.display_title}`,
        body: `Status: ${r.conclusion ?? r.status}`,
        author: r.actor?.login ?? "unknown",
        date: r.updated_at,
        url: r.html_url,
        metadata: {
          state: r.conclusion === "success" ? ("closed" as const) : ("open" as const),
        },
      }));
    } catch (e) {
      console.error(`GitHub getActions error for ${repo}:`, e);
      return [];
    }
  }

  async getRepoInfo(repo: string): Promise<RepoSummary | null> {
    try {
      const { owner, repo: name } = this.split(repo);
      const [{ data: repoData }, { data: contributors }] = await Promise.all([
        this.octokit.repos.get({ owner, repo: name }),
        this.octokit.repos.listContributors({ owner, repo: name, per_page: 5 }),
      ]);

      // Get commits in last week for velocity
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const { data: recentCommits } = await this.octokit.repos.listCommits({
        owner,
        repo: name,
        since: weekAgo.toISOString(),
        per_page: 100,
      });

      // Get latest release
      let latestRelease: RepoSummary["latest_release"];
      try {
        const { data: release } = await this.octokit.repos.getLatestRelease({
          owner,
          repo: name,
        });
        latestRelease = {
          tag: release.tag_name,
          name: release.name ?? release.tag_name,
          date: release.published_at ?? release.created_at,
        };
      } catch {
        // No releases
      }

      return {
        name: repoData.full_name,
        description: repoData.description ?? "",
        language: repoData.language ?? "Unknown",
        stars: repoData.stargazers_count,
        forks: repoData.forks_count,
        open_issues: repoData.open_issues_count,
        commits_last_week: recentCommits.length,
        top_contributors: contributors.map((c) => ({
          login: c.login ?? "unknown",
          contributions: c.contributions,
        })),
        latest_release: latestRelease,
        default_branch: repoData.default_branch,
      };
    } catch (e) {
      console.error(`GitHub getRepoInfo error for ${repo}:`, e);
      return null;
    }
  }

  private truncatePatch(patch: string | undefined, maxChars = 2000): string | undefined {
    if (!patch) return undefined;
    if (patch.length <= maxChars) return patch;
    return patch.slice(0, maxChars) + "\n[truncated]";
  }

  async getCommitDiff(repo: string, sha: string): Promise<DiffFile[]> {
    try {
      const { owner, repo: name } = this.split(repo);
      const { data } = await this.octokit.repos.getCommit({
        owner,
        repo: name,
        ref: sha,
      });
      return (data.files ?? []).map((f) => ({
        filename: f.filename,
        status: f.status ?? "modified",
        additions: f.additions,
        deletions: f.deletions,
        patch: this.truncatePatch(f.patch),
      }));
    } catch (e) {
      console.error(`GitHub getCommitDiff error:`, e);
      return [];
    }
  }

  async getPRDiff(repo: string, prNumber: number): Promise<DiffFile[]> {
    try {
      const { owner, repo: name } = this.split(repo);
      const { data } = await this.octokit.pulls.listFiles({
        owner,
        repo: name,
        pull_number: prNumber,
        per_page: 30,
      });
      return data.map((f) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        patch: this.truncatePatch(f.patch),
      }));
    } catch (e) {
      console.error(`GitHub getPRDiff error:`, e);
      return [];
    }
  }

  async getIssueDetails(repo: string, issueNumber: number): Promise<IssueDetails | null> {
    try {
      const { owner, repo: name } = this.split(repo);
      const { data } = await this.octokit.issues.get({
        owner,
        repo: name,
        issue_number: issueNumber,
      });
      return {
        number: data.number,
        title: data.title,
        body: data.body ?? "",
        state: data.state,
        author: data.user?.login ?? "unknown",
        labels: data.labels.map((l) => (typeof l === "string" ? l : l.name ?? "")),
        assignees: (data.assignees ?? []).map((a) => a.login),
        milestone: data.milestone?.title,
        created_at: data.created_at,
        closed_at: data.closed_at ?? undefined,
        url: data.html_url,
      };
    } catch (e) {
      console.error(`GitHub getIssueDetails error for #${issueNumber}:`, e);
      return null;
    }
  }

  async getPRDetails(repo: string, prNumber: number): Promise<PRDetails | null> {
    try {
      const { owner, repo: name } = this.split(repo);
      const { data } = await this.octokit.pulls.get({
        owner,
        repo: name,
        pull_number: prNumber,
      });
      return {
        number: data.number,
        title: data.title,
        body: data.body ?? "",
        state: data.merged ? "merged" : data.state,
        author: data.user?.login ?? "unknown",
        labels: data.labels.map((l) => (typeof l === "string" ? l : l.name ?? "")),
        reviewers: (data.requested_reviewers ?? []).map((r: any) => r.login ?? ""),
        merged: data.merged,
        merged_at: data.merged_at ?? undefined,
        url: data.html_url,
        additions: data.additions,
        deletions: data.deletions,
        changed_files: data.changed_files,
      };
    } catch (e) {
      console.error(`GitHub getPRDetails error for #${prNumber}:`, e);
      return null;
    }
  }

  async getPRCommits(repo: string, project: string, prNumber: number): Promise<Activity[]> {
    try {
      const { owner, repo: name } = this.split(repo);
      const { data } = await this.octokit.pulls.listCommits({
        owner,
        repo: name,
        pull_number: prNumber,
        per_page: 100,
      });
      return data.map((c) => ({
        id: c.sha,
        project,
        source: "github" as const,
        type: "commit" as const,
        title: c.commit.message.split("\n")[0],
        body: c.commit.message,
        author: c.author?.login ?? c.commit.author?.name ?? "unknown",
        date: c.commit.author?.date ?? new Date().toISOString(),
        url: c.html_url,
        metadata: {},
      }));
    } catch (e) {
      console.error(`GitHub getPRCommits error for PR #${prNumber}:`, e);
      return [];
    }
  }

  async findLinkedPRs(repo: string, issueNumber: number): Promise<number[]> {
    try {
      const { owner, repo: name } = this.split(repo);
      // Search for PRs that reference the issue number
      const { data } = await this.octokit.search.issuesAndPullRequests({
        q: `repo:${owner}/${name} is:pr ${issueNumber}`,
        per_page: 20,
      });
      return data.items
        .filter((item) => item.pull_request)
        .map((item) => item.number);
    } catch (e) {
      console.error(`GitHub findLinkedPRs error for #${issueNumber}:`, e);
      return [];
    }
  }
}
