"use client";
import * as React from "react";
import { Building2, User } from "lucide-react";
import { cn } from "@/lib/cn";
import type { PendingInstallation } from "@/lib/data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { linkAction } from "../actions";

export function LinkForm({ installations }: { installations: PendingInstallation[] }) {
  const [selected, setSelected] = React.useState(installations[0].externalInstallationId);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await linkAction(selected);
          if (r && !r.ok) setError(r.error);
        });
      }}
      className="flex flex-col gap-4"
    >
      {error && <Alert variant="danger" title="Couldn't link that account" live>{error}</Alert>}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium text-fg">Installed on</legend>
        {installations.map((i) => {
          const on = i.externalInstallationId === selected;
          const Icon = i.accountType === "Organization" ? Building2 : User;
          return (
            <label
              key={i.externalInstallationId}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors hover:bg-surface",
                "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus",
                on && "border-accent bg-accent-soft/50",
              )}
            >
              <input
                type="radio"
                name="installation"
                className="mt-1 accent-[var(--c-accent)]"
                checked={on}
                onChange={() => setSelected(i.externalInstallationId)}
              />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex items-center gap-2 font-medium text-fg">
                  <Icon className="size-4 text-muted" aria-hidden /> {i.accountLogin}
                  <span className="text-sm font-normal text-muted">{i.accountType === "Organization" ? "Organization" : "Personal account"}</span>
                </span>
                <span className="text-sm text-muted">
                  {i.repositories.length} {i.repositories.length === 1 ? "repository" : "repositories"}:{" "}
                  <span className="break-words font-mono text-xs">{i.repositories.join(", ")}</span>
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>
      <Button type="submit" size="lg" loading={pending} className="self-start">
        {pending ? "Linking" : "Link and start indexing"}
      </Button>
    </form>
  );
}
