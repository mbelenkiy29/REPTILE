"use client";
import * as React from "react";
import Link from "next/link";
import { ExternalLink, MoreHorizontal, RefreshCw, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toaster";
import { reindex, toggleReview } from "./actions";

export function RepoToggle({ id, name, enabled, disabled }: { id: string; name: string; enabled: boolean; disabled?: boolean }) {
  const [optimistic, setOptimistic] = React.useOptimistic(enabled);
  const [pending, start] = React.useTransition();
  return (
    <Switch
      checked={optimistic}
      disabled={disabled}
      saving={pending}
      aria-label={`Review pull requests in ${name}`}
      onCheckedChange={(v) =>
        start(async () => {
          setOptimistic(v);
          const r = await toggleReview(id, v);
          if (r.ok) toast.success(v ? `Reviewing pull requests in ${name}` : `Stopped reviewing ${name}`);
          else toast.error(r.error);
        })
      }
    />
  );
}

export function RepoActions({ id, name, isAdmin }: { id: string; name: string; isAdmin: boolean }) {
  const [, start] = React.useTransition();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${name}`}>
          <MoreHorizontal aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem asChild>
          <Link href={`/repos/${id}`}><Settings aria-hidden /> Details and settings</Link>
        </DropdownMenuItem>
        {isAdmin && (
          <DropdownMenuItem
            onSelect={() =>
              start(async () => {
                const r = await reindex(id);
                if (r.ok) toast.success(`Re-indexing ${name}`);
                else toast.error(r.error);
              })
            }
          >
            <RefreshCw aria-hidden /> Re-index
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <a href={`https://github.com/${name}`} target="_blank" rel="noreferrer">
            <ExternalLink aria-hidden /> Open on GitHub
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
