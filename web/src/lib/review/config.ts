// reptile.json / .reptile/config.json: schema, validation and precedence.
// Precedence, highest first: path file (.reptile/ nearest the changed file) > repo file (reptile.json)
// > repo dashboard row > org dashboard row > defaults.
import { z } from "zod";
import type { ReviewConfig } from "@/lib/data/types";
import { DEFAULT_CONFIG } from "./defaults";

const globList = z.array(z.string().trim().min(1).max(200).refine((s) => !/\s/.test(s), "Patterns can't contain spaces.")).max(100);

/** The file format. Every key optional: a file only sets what it overrides. */
export const ConfigFileSchema = z
  .object({
    strictness: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    commentTypes: z.array(z.enum(["logic", "syntax", "style", "security"])).min(1, "Pick at least one comment type."),
    reviewDrafts: z.boolean(),
    labels: globList,
    disabledLabels: globList,
    includeAuthors: globList,
    excludeAuthors: globList,
    includeBranches: globList,
    excludeBranches: globList,
    ignorePatterns: globList,
    summary: z.object({ diagram: z.boolean(), fileTable: z.boolean(), confidence: z.boolean() }).partial().strict(),
  })
  .partial()
  .strict();

export type ConfigFile = z.infer<typeof ConfigFileSchema>;

export function toConfigFile(c: ReviewConfig): ConfigFile {
  return {
    strictness: c.strictness,
    commentTypes: c.commentTypes,
    reviewDrafts: c.reviewDrafts,
    labels: c.includeLabels,
    disabledLabels: c.disabledLabels,
    includeAuthors: c.includeAuthors,
    excludeAuthors: c.excludeAuthors,
    includeBranches: c.includeBranches,
    excludeBranches: c.excludeBranches,
    ignorePatterns: c.ignorePatterns,
    summary: c.summary,
  };
}

/** Apply layers lowest-first. Arrays replace, they don't concatenate (a repo can clear an org list with []). */
export function mergeConfig(base: ReviewConfig, ...layers: (Partial<ReviewConfig> | null | undefined)[]): ReviewConfig {
  let out: ReviewConfig = { ...base, summary: { ...base.summary } };
  for (const layer of layers) {
    if (!layer) continue;
    const l = stripUndefined(layer);
    out = { ...out, ...l, summary: { ...out.summary, ...(l.summary ?? {}) } };
  }
  return out;
}

/** A reptile.json / .reptile/config.json file as a merge layer. */
export function fileLayer(f: ConfigFile | null | undefined): Partial<ReviewConfig> | null {
  return f ? fromFile(f) : null;
}

function fromFile(f: ConfigFile): Partial<ReviewConfig> {
  return stripUndefined({
    strictness: f.strictness,
    commentTypes: f.commentTypes,
    reviewDrafts: f.reviewDrafts,
    includeLabels: f.labels,
    disabledLabels: f.disabledLabels,
    includeAuthors: f.includeAuthors,
    excludeAuthors: f.excludeAuthors,
    includeBranches: f.includeBranches,
    excludeBranches: f.excludeBranches,
    ignorePatterns: f.ignorePatterns,
    summary: f.summary as ReviewConfig["summary"] | undefined,
  });
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export interface ValidationIssue {
  path: string;
  message: string;
  line?: number;
}

/** Validate pasted file text. Returns parsed config or issues with line numbers where we can find them. */
export function validateConfigText(text: string): { ok: true; config: ConfigFile } | { ok: false; issues: ValidationIssue[] } {
  if (!text.trim()) return { ok: false, issues: [{ path: "", message: "Paste the contents of reptile.json or .reptile/config.json." }] };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid JSON";
    const pos = /position (\d+)/.exec(msg)?.[1];
    const line = pos ? text.slice(0, Number(pos)).split("\n").length : undefined;
    return { ok: false, issues: [{ path: "", message: `This isn't valid JSON: ${msg.replace(/^JSON\.parse: /, "")}`, line }] };
  }
  const r = ConfigFileSchema.safeParse(json);
  if (r.success) return { ok: true, config: r.data };
  return {
    ok: false,
    issues: r.error.issues.map((i) => {
      const path = i.path.join(".");
      // Unknown keys are reported on the parent object; locate the first unknown key itself.
      const key = i.code === "unrecognized_keys" ? i.keys[0] : [...i.path].reverse().find((p) => typeof p === "string");
      const idx = key ? text.indexOf(`"${String(key)}"`) : -1;
      const message =
        i.code === "unrecognized_keys"
          ? `Unknown setting${i.keys.length > 1 ? "s" : ""}: ${i.keys.join(", ")}. Check the spelling.`
          : i.message;
      return { path, message, line: idx >= 0 ? text.slice(0, idx).split("\n").length : undefined };
    }),
  };
}

export { DEFAULT_CONFIG };
