import { simpleGit, type SimpleGit } from "simple-git";
import { existsSync } from "node:fs";
import type { Activity } from "../types.js";

export class LocalGitProvider {
  private getGit(path: string): SimpleGit {
    return simpleGit(path);
  }

  async getCommits(
    localPath: string,
    project: string,
    since: Date,
    limit: number,
  ): Promise<Activity[]> {
    try {
      if (!existsSync(localPath)) return [];
      const git = this.getGit(localPath);
      const log = await git.log({
        maxCount: limit,
        "--since": since.toISOString(),
      });
      return log.all.map((c) => ({
        id: c.hash,
        project,
        source: "local" as const,
        type: "commit" as const,
        title: c.message.split("\n")[0],
        body: c.message,
        author: c.author_name,
        date: c.date,
        metadata: {
          files_changed: (c as any).diff?.files?.length,
        },
      }));
    } catch (e) {
      console.error(`Local getCommits error for ${localPath}:`, e);
      return [];
    }
  }

  async getBranches(
    localPath: string,
    project: string,
  ): Promise<Activity[]> {
    try {
      if (!existsSync(localPath)) return [];
      const git = this.getGit(localPath);
      const branches = await git.branch(["-a", "--sort=-committerdate"]);
      return branches.all.slice(0, 20).map((name, i) => ({
        id: `branch-${i}-${name}`,
        project,
        source: "local" as const,
        type: "branch" as const,
        title: name,
        body: name === branches.current ? "(current branch)" : "",
        author: "",
        date: new Date().toISOString(),
        metadata: {},
      }));
    } catch (e) {
      console.error(`Local getBranches error for ${localPath}:`, e);
      return [];
    }
  }

  async getDiffStats(
    localPath: string,
    ref: string,
  ): Promise<{ filename: string; additions: number; deletions: number }[]> {
    try {
      if (!existsSync(localPath)) return [];
      const git = this.getGit(localPath);
      const diff = await git.diffSummary([ref]);
      return diff.files.map((f) => ({
        filename: f.file,
        additions: "insertions" in f ? f.insertions : 0,
        deletions: "deletions" in f ? f.deletions : 0,
      }));
    } catch (e) {
      console.error(`Local getDiffStats error:`, e);
      return [];
    }
  }

  async getTags(
    localPath: string,
    project: string,
    limit: number,
  ): Promise<Activity[]> {
    try {
      if (!existsSync(localPath)) return [];
      const git = this.getGit(localPath);
      const tags = await git.tags(["--sort=-creatordate"]);
      return tags.all.slice(0, limit).map((tag, i) => ({
        id: `tag-${i}-${tag}`,
        project,
        source: "local" as const,
        type: "tag" as const,
        title: tag,
        body: "",
        author: "",
        date: new Date().toISOString(),
        metadata: {},
      }));
    } catch (e) {
      console.error(`Local getTags error for ${localPath}:`, e);
      return [];
    }
  }

  async getLastActivity(localPath: string): Promise<string | null> {
    try {
      if (!existsSync(localPath)) return null;
      const git = this.getGit(localPath);
      const log = await git.log({ maxCount: 1 });
      return log.latest?.date ?? null;
    } catch (e) {
      console.error(`Local getLastActivity error for ${localPath}:`, e);
      return null;
    }
  }

  async getFullDiff(
    localPath: string,
    ref: string,
    maxBytes = 50_000,
  ): Promise<string> {
    try {
      if (!existsSync(localPath)) return "";
      const git = this.getGit(localPath);
      const raw = await git.diff([ref]);
      if (raw.length > maxBytes) {
        return raw.slice(0, maxBytes) + "\n\n[truncated — diff exceeded 50 KB]";
      }
      return raw;
    } catch (e) {
      console.error(`Local getFullDiff error:`, e);
      return "";
    }
  }
}
