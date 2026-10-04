// Unified-diff helpers. GitHub only accepts review comments on lines that appear in the diff
// (added or context lines on the RIGHT side), so every finding is checked against this before posting.

export interface ParsedPatch {
  /** New-file line numbers visible in the diff (added + context). */
  rightLines: Set<number>;
  /** New-file line numbers that were added. */
  added: Set<number>;
  /** The added text of each hunk, for retrieval queries. */
  hunks: string[];
}

export function parsePatch(patch: string | undefined): ParsedPatch {
  const rightLines = new Set<number>();
  const added = new Set<number>();
  const hunks: string[] = [];
  if (!patch) return { rightLines, added, hunks };
  let line = 0;
  let cur: string[] = [];
  for (const l of patch.split("\n")) {
    const h = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(l);
    if (h) {
      if (cur.length) hunks.push(cur.join("\n"));
      cur = [];
      line = Number(h[1]);
      continue;
    }
    if (l.startsWith("\\")) continue; // "\ No newline at end of file"
    if (l.startsWith("-")) continue;
    if (l.startsWith("+")) {
      rightLines.add(line);
      added.add(line);
      cur.push(l.slice(1));
    } else {
      rightLines.add(line);
    }
    line++;
  }
  if (cur.length) hunks.push(cur.join("\n"));
  return { rightLines, added, hunks };
}

/** Pick a valid anchor for a finding: the whole range if every line is in the diff, else its last diff line. */
export function anchor(p: ParsedPatch, start: number, end: number): { line: number; startLine?: number } | null {
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  let all = true;
  for (let i = lo; i <= hi; i++) if (!p.rightLines.has(i)) all = false;
  if (all) return lo === hi ? { line: hi } : { line: hi, startLine: lo };
  for (let i = hi; i >= lo; i--) if (p.rightLines.has(i)) return { line: i };
  return null;
}
