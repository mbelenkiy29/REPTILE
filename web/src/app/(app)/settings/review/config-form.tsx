"use client";
import * as React from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import type { FindingType, ReviewConfig } from "@/lib/data";
import { toConfigFile } from "@/lib/review/config";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChipInput } from "@/components/ui/chip-input";
import { CopyButton } from "@/components/ui/code-block";
import { Field } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toaster";
import { saveConfig } from "./actions";

const STRICTNESS = {
  1: "Verbose: everything worth mentioning, including style nits. Good while you calibrate.",
  2: "Balanced: bugs and real quality problems. Most teams stay here.",
  3: "Critical only: just what would break production or leak data.",
} as const;

const TYPES: { value: FindingType; label: string; help: string }[] = [
  { value: "logic", label: "Logic", help: "Bugs, wrong behaviour, missed edge cases" },
  { value: "syntax", label: "Syntax", help: "Code that won't compile or run" },
  { value: "style", label: "Style", help: "Naming, dead code, readability" },
  { value: "security", label: "Security", help: "Injection, auth gaps, secrets, unsafe input" },
];

const noSpace = (v: string) => (/\s/.test(v) ? "Patterns can't contain spaces." : undefined);

export function ConfigForm({
  repoId,
  initial,
  readOnly,
  scopeLabel,
}: {
  repoId: string | null;
  initial: ReviewConfig;
  readOnly: boolean;
  scopeLabel: string;
}) {
  const [c, setC] = React.useState(initial);
  const [saved, setSaved] = React.useState(initial);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const dirty = JSON.stringify(c) !== JSON.stringify(saved);
  const set = <K extends keyof ReviewConfig>(k: K, v: ReviewConfig[K]) => setC((x) => ({ ...x, [k]: v }));
  const json = JSON.stringify(toConfigFile(c), null, 2);

  // Warn before leaving with unsaved changes.
  React.useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await saveConfig(repoId, c);
          if (!r.ok) {
            setError(r.error);
            toast.error("Settings weren't saved");
            return;
          }
          setSaved(c);
          toast.success(`Saved ${scopeLabel}`);
        });
      }}
      className="flex flex-col gap-6 pb-20"
    >
      <fieldset disabled={readOnly || pending} className="contents">
        <Card title="How picky to be" description="Applies to every comment REPTILE posts.">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-fg" id="strictness-label">Strictness</span>
              <Segmented
                label="Strictness"
                value={String(c.strictness) as "1" | "2" | "3"}
                onValueChange={(v) => set("strictness", Number(v) as 1 | 2 | 3)}
                options={[{ value: "1", label: "1" }, { value: "2", label: "2" }, { value: "3", label: "3" }]}
                disabled={readOnly}
              />
              <p className="text-sm text-muted">{STRICTNESS[c.strictness]}</p>
            </div>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium text-fg">Comment on</legend>
              {TYPES.map((t) => {
                const on = c.commentTypes.includes(t.value);
                return (
                  <label key={t.value} className="flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      className="mt-1 size-4 accent-[var(--c-accent)]"
                      checked={on}
                      onChange={() => set("commentTypes", on ? c.commentTypes.filter((x) => x !== t.value) : [...c.commentTypes, t.value])}
                    />
                    <span>
                      <span className="text-base text-fg">{t.label}</span>
                      <span className="block text-sm text-muted">{t.help}</span>
                    </span>
                  </label>
                );
              })}
              {c.commentTypes.length === 0 && <p className="text-sm text-danger" role="alert">Pick at least one, or turn reviews off for the repository instead.</p>}
            </fieldset>
          </div>
        </Card>

        <Card title="Which pull requests get reviewed" description="Automatic reviews only. Commenting @reptile on a pull request always runs one.">
          <div className="flex flex-col gap-5">
            <label className="flex items-center gap-3">
              <Switch checked={c.reviewDrafts} onCheckedChange={(v) => set("reviewDrafts", v)} disabled={readOnly} aria-label="Review draft pull requests" />
              <span className="text-base text-fg">Review draft pull requests</span>
            </label>
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Only with these labels" hint="Leave empty to review regardless of labels.">
                {(p) => <ChipInput {...p} value={c.includeLabels} onChange={(v) => set("includeLabels", v)} placeholder="needs-review" validate={noSpace} disabled={readOnly} />}
              </Field>
              <Field label="Never with these labels">
                {(p) => <ChipInput {...p} value={c.disabledLabels} onChange={(v) => set("disabledLabels", v)} placeholder="no-review" validate={noSpace} disabled={readOnly} />}
              </Field>
              <Field label="Only these authors" hint="GitHub usernames; * works as a wildcard.">
                {(p) => <ChipInput {...p} value={c.includeAuthors} onChange={(v) => set("includeAuthors", v)} placeholder="octocat" validate={noSpace} disabled={readOnly} />}
              </Field>
              <Field label="Never these authors" hint="Bots are a common choice, like *[bot].">
                {(p) => <ChipInput {...p} value={c.excludeAuthors} onChange={(v) => set("excludeAuthors", v)} placeholder="*[bot]" validate={noSpace} disabled={readOnly} />}
              </Field>
              <Field label="Only into these branches" hint="The pull request's base branch, like main or release/*.">
                {(p) => <ChipInput {...p} value={c.includeBranches} onChange={(v) => set("includeBranches", v)} placeholder="main" validate={noSpace} disabled={readOnly} />}
              </Field>
              <Field label="Never into these branches">
                {(p) => <ChipInput {...p} value={c.excludeBranches} onChange={(v) => set("excludeBranches", v)} placeholder="experiments/*" validate={noSpace} disabled={readOnly} />}
              </Field>
            </div>
          </div>
        </Card>

        <Card title="Files to skip" description="Skipped files aren't commented on, but they're still read for context.">
          <Field label="Ignore patterns" hint="Same syntax as .gitignore, like dist/** or **/*.snap.">
            {(p) => <ChipInput {...p} value={c.ignorePatterns} onChange={(v) => set("ignorePatterns", v)} placeholder="**/*.generated.ts" validate={noSpace} disabled={readOnly} />}
          </Field>
        </Card>

        <Card title="Summary comment" description="What goes into the comment at the top of each pull request.">
          <div className="flex flex-col gap-3">
            {([
              ["confidence", "Confidence score and verdict"],
              ["fileTable", "Table of files reviewed"],
              ["diagram", "Sequence diagram of the change"],
            ] as const).map(([k, label]) => (
              <label key={k} className="flex items-center gap-3">
                <Switch checked={c.summary[k]} onCheckedChange={(v) => set("summary", { ...c.summary, [k]: v })} disabled={readOnly} aria-label={label} />
                <span className="text-base text-fg">{label}</span>
              </label>
            ))}
          </div>
        </Card>
      </fieldset>

      <Card
        title="As a file"
        description={<>Commit this as <code className="font-mono">reptile.json</code> to set it per repository. Files win over the dashboard. <Link className="text-accent underline underline-offset-2" href="/settings/review/validate">Check a file</Link></>}
        actions={
          <>
            <CopyButton value={json} />
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => {
                const url = URL.createObjectURL(new Blob([json + "\n"], { type: "application/json" }));
                const a = Object.assign(document.createElement("a"), { href: url, download: "reptile.json" });
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              <Download aria-hidden /> Download
            </Button>
          </>
        }
      >
        <pre tabIndex={0} aria-label="reptile.json" className="max-h-64 overflow-auto rounded-md border bg-surface-sunken p-3 font-mono text-sm text-fg">{json}</pre>
      </Card>

      {!readOnly && (
        <div className="sticky bottom-0 z-[var(--z-sticky)] -mx-4 flex flex-wrap items-center justify-end gap-2 border-t bg-bg/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
          {error && <p className="mr-auto text-sm text-danger" role="alert">{error}</p>}
          {dirty && !error && <p className="mr-auto text-sm text-muted">Unsaved changes</p>}
          <Button type="button" variant="secondary" disabled={!dirty || pending} onClick={() => { setC(saved); setError(null); }}>
            Discard
          </Button>
          <Button type="submit" disabled={!dirty || c.commentTypes.length === 0} loading={pending}>
            Save changes
          </Button>
        </div>
      )}
    </form>
  );
}
