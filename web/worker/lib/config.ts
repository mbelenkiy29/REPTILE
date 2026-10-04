// Effective review config for one PR: defaults < org < repo dashboard row < reptile.json < nearest .reptile/config.json.
import { and, eq, isNull, or } from "drizzle-orm";
import picomatch from "picomatch";
import { db, schema as s } from "@/db";
import { rowToConfig, type ReviewConfig } from "@/lib/data";
import { fileLayer, mergeConfig, validateConfigText } from "@/lib/review/config";
import { DEFAULT_CONFIG } from "@/lib/review/defaults";
import type { GitHost } from "@/lib/github";

export interface PrConfig {
  repo: ReviewConfig;
  forFile(path: string): ReviewConfig;
  problems: string[];
}

export async function loadPrConfig(gh: GitHost, installationId: number, repo: { id: string; orgId: string; fullName: string }, headSha: string, paths: string[]): Promise<PrConfig> {
  const rows = await db.select().from(s.reviewConfigs)
    .where(and(eq(s.reviewConfigs.orgId, repo.orgId), or(isNull(s.reviewConfigs.repoId), eq(s.reviewConfigs.repoId, repo.id))));
  const problems: string[] = [];
  const read = async (path: string) => {
    const text = await gh.getFile(installationId, repo.fullName, path, headSha);
    if (text === null) return null;
    const v = validateConfigText(text);
    if (!v.ok) {
      problems.push(`${path}: ${v.issues.map((i) => i.message).join("; ")}`);
      return null;
    }
    return fileLayer(v.config);
  };
  const base = mergeConfig(DEFAULT_CONFIG, rowToConfig(rows.find((r) => r.repoId === null)), rowToConfig(rows.find((r) => r.repoId === repo.id)), await read("reptile.json"));

  // .reptile/config.json in any directory that holds a changed file, or one of its parents (capped).
  const dirs = new Set<string>();
  for (const p of paths) {
    const parts = p.split("/").slice(0, -1);
    for (let i = 1; i <= parts.length; i++) dirs.add(parts.slice(0, i).join("/"));
  }
  const dirLayers = new Map<string, Partial<ReviewConfig>>();
  const rootLayer = await read(".reptile/config.json");
  for (const d of [...dirs].sort((a, b) => a.length - b.length).slice(0, 40)) {
    const layer = await read(`${d}/.reptile/config.json`);
    if (layer) dirLayers.set(d, layer);
  }
  const repoCfg = mergeConfig(base, rootLayer);
  return {
    repo: repoCfg,
    problems,
    forFile(path: string) {
      const layers = [...dirLayers.entries()].filter(([d]) => path.startsWith(d + "/")).sort((a, b) => a[0].length - b[0].length).map(([, l]) => l);
      return mergeConfig(repoCfg, ...layers);
    },
  };
}

// Case-insensitive like the dashboard's filters (src/lib/review/should-review.ts), so README.MD matches **/*.md everywhere.
export const matchesAny = (patterns: string[], path: string) => patterns.some((p) => picomatch.isMatch(path, p, { dot: true, nocase: true }));
