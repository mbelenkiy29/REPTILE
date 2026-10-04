import * as React from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/cn";

const variants = {
  info: { cls: "bg-info-soft text-info", Icon: Info },
  success: { cls: "bg-success-soft text-success", Icon: CircleCheck },
  warning: { cls: "bg-warning-soft text-warning", Icon: TriangleAlert },
  danger: { cls: "bg-danger-soft text-danger", Icon: CircleAlert },
} as const;

export function Alert({
  variant = "info",
  title,
  children,
  action,
  live,
  className,
}: {
  variant?: keyof typeof variants;
  title: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  /** Set when the alert appears in response to an action, so it is announced. */
  live?: boolean;
  className?: string;
}) {
  const { cls, Icon } = variants[variant];
  return (
    <div
      role={live ? (variant === "danger" || variant === "warning" ? "alert" : "status") : undefined}
      className={cn("flex items-start gap-3 rounded-lg px-4 py-3", cls, className)}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        {children && <div className="mt-0.5 text-sm text-fg">{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
