"use client";
import * as React from "react";
import { Activity, BookOpen, CircleAlert, CircleCheck, ListTodo, MessageSquare, SquareKanban, type LucideIcon } from "lucide-react";
import type { IntegrationKind } from "@/lib/data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { connect, disconnect } from "./actions";

// Generic icons, not vendor marks: /replica-brand swaps in official logos under each vendor's rules.
const ICON: Record<IntegrationKind, LucideIcon> = { linear: ListTodo, jira: SquareKanban, slack: MessageSquare, notion: BookOpen, datadog: Activity };

export function IntegrationCard({ kind, name, what, status, detail, canEdit }: {
  kind: IntegrationKind; name: string; what: string; status: "connected" | "error" | "disconnected"; detail: string | null; canEdit: boolean;
}) {
  const [pending, start] = React.useTransition();
  const [confirm, setConfirm] = React.useState(false);
  const Icon = ICON[kind];
  const doConnect = () => start(async () => {
    const r = await connect(kind);
    if (r.ok) toast.success(`${name} connected`);
    else toast.error(r.error);
  });
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-bg p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-md border bg-surface text-fg"><Icon className="size-4" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-fg">{name}</h2>
            {status === "connected" && <Badge tone="success"><CircleCheck className="size-3" aria-hidden /> Connected</Badge>}
            {status === "error" && <Badge tone="danger"><CircleAlert className="size-3" aria-hidden /> Needs attention</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted">{what}</p>
        </div>
      </div>
      {detail && <p className={status === "error" ? "text-sm text-danger" : "text-sm text-muted"}>{detail}</p>}
      {canEdit && (
        <div className="mt-auto flex gap-2">
          {status === "disconnected" && <Button size="sm" loading={pending} onClick={doConnect}>Connect {name}</Button>}
          {status === "error" && <Button size="sm" loading={pending} onClick={doConnect}>Reconnect</Button>}
          {status !== "disconnected" && (
            <ConfirmDialog
              open={confirm}
              onOpenChange={setConfirm}
              trigger={<Button size="sm" variant="secondary">Disconnect</Button>}
              title={`Disconnect ${name}?`}
              description="Reviews stop using it as context. You can connect it again any time."
              confirmLabel="Disconnect"
              loading={pending}
              onConfirm={() => start(async () => {
                const r = await disconnect(kind);
                setConfirm(false);
                if (r.ok) toast.success(`${name} disconnected`);
                else toast.error(r.error);
              })}
            />
          )}
        </div>
      )}
    </div>
  );
}
