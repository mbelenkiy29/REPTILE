import * as React from "react";
import { GitBranch, CircleCheck } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./button";
import { Badge } from "./badge";

export type ProviderState = "disconnected" | "connecting" | "connected" | "error" | "soon";

export function ProviderCard({
  name,
  description,
  state,
  account,
  onConnect,
  onManage,
  error,
}: {
  name: string;
  description: string;
  state: ProviderState;
  account?: string;
  onConnect?: () => void;
  onManage?: () => void;
  error?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3 rounded-lg border bg-bg p-4", state === "soon" && "border-dashed bg-surface")}>
      <div className="flex items-start gap-3">
        {/* Generic mark until /replica-brand adds official provider logos under their brand rules. */}
        <span className="grid size-9 shrink-0 place-items-center rounded-md border bg-surface text-fg">
          <GitBranch className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-fg">{name}</h3>
            {state === "soon" && <Badge>Coming soon</Badge>}
            {state === "connected" && (
              <Badge tone="success">
                <CircleCheck className="size-3" aria-hidden />
                Connected
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted">{state === "connected" && account ? `Linked to ${account}` : description}</p>
        </div>
      </div>
      {state === "error" && error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        {state === "connected" ? (
          <Button variant="secondary" size="sm" onClick={onManage}>
            Manage
          </Button>
        ) : (
          <Button
            size="sm"
            variant={state === "error" ? "secondary" : "primary"}
            loading={state === "connecting"}
            disabled={state === "soon"}
            onClick={onConnect}
          >
            {state === "error" ? "Try again" : `Connect ${name}`}
          </Button>
        )}
      </div>
    </div>
  );
}
