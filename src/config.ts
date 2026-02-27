import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, basename } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import type { AppConfig, ProjectRef } from "./types.js";
import { slugify } from "./utils.js";

const CONFIG_PATH = join(
  homedir(),
  ".config",
  "project-activity-mcp",
  "config.yaml",
);

const ConfigSchema = z.object({
  github: z
    .object({
      token_env: z.string().optional(),
      repos: z.array(z.string()),
    })
    .optional(),
  local: z
    .object({
      paths: z.array(z.string()),
    })
    .optional(),
  defaults: z
    .object({
      since: z.string().default("7d"),
      limit: z.number().default(20),
    })
    .default({ since: "7d", limit: 20 }),
});

/** Expand ~ to the user's home directory. */
export function expandPath(p: string): string {
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  return p;
}

/** Load and validate config from ~/.config/project-activity-mcp/config.yaml */
export function loadConfig(): AppConfig {
  if (!existsSync(CONFIG_PATH)) {
    console.error(`Config not found at ${CONFIG_PATH}, using defaults`);
    return { defaults: { since: "7d", limit: 20 } };
  }

  const raw = readFileSync(CONFIG_PATH, "utf-8");
  const parsed = parseYaml(raw);
  return ConfigSchema.parse(parsed);
}

/** Merge github repos + local paths into a unified ProjectRef list keyed by slug. */
export function deriveProjects(config: AppConfig): ProjectRef[] {
  const map = new Map<string, ProjectRef>();

  if (config.github?.repos) {
    for (const repo of config.github.repos) {
      const slug = slugify(repo);
      const existing = map.get(slug);
      if (existing) {
        existing.githubRepo = repo;
        if (!existing.sources.includes("github")) existing.sources.push("github");
      } else {
        map.set(slug, { name: slug, githubRepo: repo, sources: ["github"] });
      }
    }
  }

  if (config.local?.paths) {
    for (const rawPath of config.local.paths) {
      const fullPath = expandPath(rawPath);
      const slug = basename(fullPath).toLowerCase();
      const existing = map.get(slug);
      if (existing) {
        existing.localPath = fullPath;
        if (!existing.sources.includes("local")) existing.sources.push("local");
      } else {
        map.set(slug, { name: slug, localPath: fullPath, sources: ["local"] });
      }
    }
  }

  return Array.from(map.values());
}

/** Resolve the GitHub token from env. */
export function resolveToken(config: AppConfig): string | undefined {
  const envVar = config.github?.token_env ?? "GITHUB_TOKEN";
  return process.env[envVar];
}
