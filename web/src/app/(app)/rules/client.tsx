"use client";
import * as React from "react";
import { MoreHorizontal, Pencil, Plus, Power, Trash2 } from "lucide-react";
import type { Rule } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { ChipInput } from "@/components/ui/chip-input";
import { ConfirmDialog, Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, Textarea } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { changeRuleStatus, removeRule, saveRule } from "./actions";

type Repo = { id: string; name: string };
type EditableRule = Pick<Rule, "id" | "text" | "kind" | "repoIds" | "pathGlobs" | "status" | "source">;

function RuleFormFields({ repos, initial, onDone }: { repos: Repo[]; initial?: EditableRule; onDone: () => void }) {
  const [text, setText] = React.useState(initial?.text ?? "");
  const [kind, setKind] = React.useState<Rule["kind"]>(initial?.kind ?? "rule");
  const [scope, setScope] = React.useState<"all" | "some">(initial?.repoIds.length ? "some" : "all");
  const [repoIds, setRepoIds] = React.useState<string[]>(initial?.repoIds ?? []);
  const [globs, setGlobs] = React.useState<string[]>(initial?.pathGlobs ?? []);
  const [error, setError] = React.useState<string>();
  const [pending, start] = React.useTransition();

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (scope === "some" && !repoIds.length) return setError("Pick at least one repository, or choose all repositories.");
        start(async () => {
          const r = await saveRule(initial?.id ?? null, { text, kind, repoIds: scope === "all" ? [] : repoIds, pathGlobs: globs });
          if (!r.ok) return setError(r.error);
          toast.success(initial ? "Rule updated" : "Rule added");
          onDone();
        });
      }}
    >
      <Field label="Rule" hint="One idea per rule. Say what to do and, if it helps, why." error={error}>
        {(p) => <Textarea {...p} value={text} onChange={(e) => { setText(e.target.value); setError(undefined); }} required minLength={3} maxLength={4000} rows={4} autoFocus placeholder="Background jobs must be idempotent: running one twice can't charge, email or write twice." />}
      </Field>
      <Field label="Type">
        {(p) => (
          <Select {...p} value={kind} onValueChange={(v) => setKind(v as Rule["kind"])} options={[
            { value: "rule", label: "Rule: something to enforce" },
            { value: "style_guide", label: "Style guide: how code should read" },
            { value: "doc", label: "Reference: context, not enforced" },
          ]} />
        )}
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-fg">Repositories</legend>
        <label className="flex items-center gap-2 text-base"><input type="radio" name="scope" className="accent-[var(--c-accent)]" checked={scope === "all"} onChange={() => setScope("all")} /> All repositories</label>
        <label className="flex items-center gap-2 text-base"><input type="radio" name="scope" className="accent-[var(--c-accent)]" checked={scope === "some"} onChange={() => setScope("some")} /> Only some</label>
        {scope === "some" && (
          <div className="ml-6 flex max-h-40 flex-col gap-1.5 overflow-y-auto rounded-md border p-2">
            {repos.map((r) => (
              <label key={r.id} className="flex items-center gap-2 text-sm text-fg">
                <input type="checkbox" className="accent-[var(--c-accent)]" checked={repoIds.includes(r.id)}
                  onChange={(e) => setRepoIds(e.target.checked ? [...repoIds, r.id] : repoIds.filter((x) => x !== r.id))} />
                <span className="truncate">{r.name}</span>
              </label>
            ))}
          </div>
        )}
      </fieldset>
      <Field label="Only for these paths" optional hint="Globs like src/api/** or **/*.test.ts. Empty means every file.">
        {(p) => <ChipInput {...p} value={globs} onChange={setGlobs} placeholder="src/api/**" validate={(v) => (/\s/.test(v) ? "Patterns can't contain spaces." : undefined)} />}
      </Field>
      <div className="mt-2 flex justify-end gap-2">
        <DialogClose asChild><Button variant="secondary">Cancel</Button></DialogClose>
        <Button type="submit" loading={pending}>{initial ? "Save rule" : "Add rule"}</Button>
      </div>
    </form>
  );
}

export function RuleEditor({ repos, initial, triggerLabel = "Add rule", open: controlledOpen, onOpenChange }: {
  repos: Repo[]; initial?: EditableRule; triggerLabel?: string; open?: boolean; onOpenChange?: (o: boolean) => void;
}) {
  const [own, setOwn] = React.useState(false);
  const open = controlledOpen ?? own;
  const setOpen = onOpenChange ?? setOwn;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!initial && (
        <DialogTrigger asChild>
          <Button size="sm"><Plus aria-hidden /> {triggerLabel}</Button>
        </DialogTrigger>
      )}
      <DialogContent title={initial ? "Edit rule" : "Add a rule"} description="Rules apply from the next review." size="lg">
        <RuleFormFields repos={repos} initial={initial} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

export function RuleActions({ rule, repos }: { rule: EditableRule; repos: Repo[] }) {
  const [editing, setEditing] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [pending, start] = React.useTransition();
  const turnOn = rule.status === "disabled";
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Rule actions"><MoreHorizontal aria-hidden /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => setEditing(true)}><Pencil aria-hidden /> Edit</DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => start(async () => {
              const r = await changeRuleStatus(rule.id, turnOn ? "active" : "disabled");
              if (r.ok) toast.success(turnOn ? "Rule turned on" : "Rule turned off");
              else toast.error(r.error);
            })}
          >
            <Power aria-hidden /> {turnOn ? "Turn on" : "Turn off"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive onSelect={() => setDeleting(true)}><Trash2 aria-hidden /> Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <RuleEditor repos={repos} initial={rule} open={editing} onOpenChange={setEditing} />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete this rule?"
        description={rule.source === "file" ? "It comes from a file in the repository, so it returns on the next index unless the file changes. Turn it off instead to keep it off." : "Reviews stop checking it. Past comments that cited it stay on GitHub."}
        confirmLabel="Delete rule"
        loading={pending}
        onConfirm={() => start(async () => {
          const r = await removeRule(rule.id);
          setDeleting(false);
          if (r.ok) toast.success("Rule deleted");
          else toast.error(r.error);
        })}
      />
    </>
  );
}

export function SuggestionActions({ id }: { id: string }) {
  const [pending, start] = React.useTransition();
  const act = (status: "active" | "disabled", msg: string) => start(async () => {
    const r = await changeRuleStatus(id, status);
    if (r.ok) toast.success(msg);
    else toast.error(r.error);
  });
  return (
    <div className="flex gap-2">
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => act("disabled", "Suggestion dismissed")}>Dismiss</Button>
      <Button size="sm" loading={pending} onClick={() => act("active", "Rule added")}>Accept</Button>
    </div>
  );
}
