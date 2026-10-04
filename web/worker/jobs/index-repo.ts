// index-repo: shallow clone at the default branch, chunk text files, embed only chunks that changed, store in pgvector.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { and, eq, notInArray } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { gitHost } from "@/lib/github";
import { embedder } from "../ai";
import { isSkippable, looksBinary } from "../lib/files";
import { matchesAny } from "../lib/config";

const run = promisify(execFile);
const MAX_FILE_BYTES = 200_000;
const MAX_FILES = 20_000;
const CHUNK_LINES = 60;
const OVERLAP = 10;

export interface Chunk { path: string; startLine: number; endLine: number; content: string; symbol: string | null; hash: string }

const SYMBOL = /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\*?|class|interface|type|const|def|func|fn|struct|enum|impl|module)\s+([A-Za-z_$][\w$]*)/;

/** Fixed windows with overlap, nudged to start at a blank line when one is close. */
export function chunkFile(path: string, text: string): Chunk[] {
  const lines = text.split("\n");
  const out: Chunk[] = [];
  let start = 0;
  while (start < lines.length) {
    let end = Math.min(lines.length, start + CHUNK_LINES);
    if (end < lines.length) {
      for (let k = end; k > end - 15 && k > start + 20; k--) if (!lines[k - 1].trim()) { end = k; break; }
    }
    const body = lines.slice(start, end).join("\n");
    if (body.trim()) {
      const sym = lines.slice(start, end).map((l) => SYMBOL.exec(l)?.[1]).find(Boolean) ?? null;
      out.push({ path, startLine: start + 1, endLine: end, content: body, symbol: sym, hash: createHash("sha1").update(path + "\0" + body).digest("hex") });
    }
    if (end >= lines.length) break;
    start = Math.max(end - OVERLAP, start + 1);
  }
  return out;
}

/** Clone URL: GitHub with an installation token, or REPTILE_GIT_BASE (a local file:// base) in tests and fake mode. */
function cloneUrl(fullName: string, token: string) {
  const base = process.env.REPTILE_GIT_BASE;
  if (base) return `${base.replace(/\/$/, "")}/${fullName}.git`;
  return `https://x-access-token:${token}@github.com/${fullName}.git`;
}

export async function indexRepo(repoId: string) {
  const [repo] = await db.select().from(s.repositories).where(eq(s.repositories.id, repoId));
  if (!repo || repo.removedAt) return { result: "gone" };
  const [inst] = await db.select().from(s.installations).where(eq(s.installations.id, repo.installationId));
  const [cfg] = await db.select({ ignore: s.reviewConfigs.ignorePatterns }).from(s.reviewConfigs).where(and(eq(s.reviewConfigs.orgId, repo.orgId), eq(s.reviewConfigs.repoId, repo.id)));
  const setStatus = (v: Partial<typeof s.repositories.$inferInsert>) => db.update(s.repositories).set({ ...v, updatedAt: new Date().toISOString() }).where(eq(s.repositories.id, repoId));

  const dir = await mkdtemp(join(tmpdir(), "reptile-index-"));
  try {
    await setStatus({ indexStatus: "cloning", indexError: null });
    const token = await (await gitHost()).installationToken(inst.externalInstallationId);
    try {
      await run("git", ["clone", "--depth", "1", "--single-branch", "--no-tags", "--filter=blob:limit=1m", cloneUrl(repo.fullName, token), dir], { timeout: 10 * 60_000, maxBuffer: 1 << 26 });
    } catch (e) {
      // Never let the token reach logs or the UI.
      const msg = String((e as Error).message).replace(/x-access-token:[^@]+@/g, "x-access-token:***@");
      throw new Error(/timed out|ETIMEDOUT|SIGTERM/.test(msg) ? "The clone timed out after 10 minutes. Very large files usually cause this; add them to ignore patterns and re-index." : `The clone failed: ${msg.split("\n")[0].slice(0, 200)}`);
    }
    const sha = (await run("git", ["-C", dir, "rev-parse", "HEAD"])).stdout.trim();
    await setStatus({ indexStatus: "processing" });

    const paths = (await run("git", ["-C", dir, "ls-files"], { maxBuffer: 1 << 26 })).stdout.split("\n").filter(Boolean)
      .filter((p) => !isSkippable(p) && !matchesAny(cfg?.ignore ?? [], p)).slice(0, MAX_FILES);
    const chunks: Chunk[] = [];
    let files = 0;
    for (const p of paths) {
      const full = join(dir, p);
      const st = await stat(full).catch(() => null);
      if (!st?.isFile() || st.size > MAX_FILE_BYTES) continue;
      const text = await readFile(full, "utf8").catch(() => null);
      if (!text || looksBinary(text)) continue;
      files++;
      chunks.push(...chunkFile(p, text));
    }

    // Embed only chunks we don't already have (same path + content hash).
    const have = await db.select({ id: s.codeChunks.id, path: s.codeChunks.path, hash: s.codeChunks.contentHash, start: s.codeChunks.startLine }).from(s.codeChunks).where(eq(s.codeChunks.repoId, repoId));
    const key = (p: string, start: number, h: string) => `${p}\0${start}\0${h}`;
    const existing = new Map(have.map((h) => [key(h.path, h.start, h.hash), h.id]));
    const keep = chunks.map((c) => existing.get(key(c.path, c.startLine, c.hash))).filter((x): x is string => !!x);
    const todo = chunks.filter((c) => !existing.has(key(c.path, c.startLine, c.hash)));
    const emb = await embedder();
    for (let i = 0; i < todo.length; i += 64) {
      const part = todo.slice(i, i + 64);
      const vectors = await emb.embed(part.map((c) => `${c.path}\n${c.content}`), "document");
      const ins = await db.insert(s.codeChunks).values(part.map((c, k) => ({
        orgId: repo.orgId, repoId, path: c.path, symbol: c.symbol, startLine: c.startLine, endLine: c.endLine, contentHash: c.hash, content: c.content, embedding: vectors[k],
      }))).onConflictDoNothing().returning({ id: s.codeChunks.id });
      keep.push(...ins.map((r) => r.id));
    }
    // Drop chunks for files that changed or disappeared.
    await db.delete(s.codeChunks).where(keep.length ? and(eq(s.codeChunks.repoId, repoId), notInArray(s.codeChunks.id, keep)) : eq(s.codeChunks.repoId, repoId));
    await setStatus({ indexStatus: "completed", indexedSha: sha.slice(0, 40), filesIndexed: files, lastIndexedAt: new Date().toISOString() });
    return { result: "completed", files, chunks: chunks.length, embedded: todo.length };
  } catch (e) {
    await setStatus({ indexStatus: "failed", indexError: e instanceof Error ? e.message.slice(0, 500) : "Indexing failed." });
    throw e;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
