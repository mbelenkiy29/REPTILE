"use client";
import * as React from "react";
import { RefreshCw } from "lucide-react";
import type { ReviewConfig } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { reindex } from "../actions";
import { resetRepoConfig } from "../../settings/review/actions";
import { ConfigForm } from "../../settings/review/config-form";

export function ReindexButton({ repoId, name, disabled, variant = "primary", label = "Re-index" }: { repoId: string; name: string; disabled?: boolean; variant?: "primary" | "secondary"; label?: string }) {
  const [pending, start] = React.useTransition();
  return (
    <Button
      size="sm"
      variant={variant}
      disabled={disabled}
      loading={pending}
      onClick={() =>
        start(async () => {
          const r = await reindex(repoId);
          if (r.ok) toast.success(`Re-indexing ${name}`);
          else toast.error(r.error);
        })
      }
    >
      {!pending && <RefreshCw aria-hidden />} {label}
    </Button>
  );
}

export function RepoSettings({ repoId, hasOverride, effective, readOnly }: { repoId: string; hasOverride: boolean; effective: ReviewConfig; readOnly: boolean }) {
  const [editing, setEditing] = React.useState(hasOverride);
  const [confirm, setConfirm] = React.useState(false);
  const [pending, start] = React.useTransition();

  if (!editing) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-lg border bg-surface p-4">
        <p className="text-fg">This repository uses your organization&apos;s review settings.</p>
        <p className="text-sm text-muted">A countersign.json in the repository still takes priority over both.</p>
        {!readOnly && <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>Customize for this repository</Button>}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-surface p-4">
        <p className="text-fg">{hasOverride ? "Custom settings for this repository." : "Customizing: these start from your organization settings."}</p>
        {!readOnly && (hasOverride ? (
          <ConfirmDialog
            open={confirm}
            onOpenChange={setConfirm}
            trigger={<Button size="sm" variant="secondary">Use organization settings</Button>}
            title="Go back to organization settings?"
            description="The custom settings for this repository are deleted. Organization settings apply from the next review."
            confirmLabel="Use organization settings"
            loading={pending}
            onConfirm={() =>
              start(async () => {
                const r = await resetRepoConfig(repoId);
                setConfirm(false);
                if (r.ok) { toast.success("Using organization settings"); setEditing(false); }
                else toast.error(r.error);
              })
            }
          />
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
        ))}
      </div>
      <ConfigForm repoId={repoId} initial={effective} readOnly={readOnly} scopeLabel="repository settings" />
    </div>
  );
}
