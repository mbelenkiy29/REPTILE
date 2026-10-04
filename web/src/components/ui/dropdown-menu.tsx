"use client";
import * as React from "react";
import { DropdownMenu as D } from "radix-ui";
import { cn } from "@/lib/cn";

export const DropdownMenu = D.Root;
export const DropdownMenuTrigger = D.Trigger;

export function DropdownMenuContent({ className, ...props }: React.ComponentProps<typeof D.Content>) {
  return (
    <D.Portal>
      <D.Content
        sideOffset={4}
        align="end"
        className={cn("z-[var(--z-dropdown)] min-w-44 rounded-lg border bg-bg p-1 shadow-pop", className)}
        {...props}
      />
    </D.Portal>
  );
}

export function DropdownMenuItem({
  className,
  destructive,
  ...props
}: React.ComponentProps<typeof D.Item> & { destructive?: boolean }) {
  return (
    <D.Item
      className={cn(
        "flex h-8 cursor-default select-none items-center gap-2 rounded-md px-2 text-base outline-none [&_svg]:size-4",
        "data-[disabled]:opacity-50 data-[highlighted]:bg-surface",
        destructive ? "text-danger" : "text-fg",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof D.Label>) {
  return <D.Label className={cn("px-2 py-1.5 text-xs text-muted", className)} {...props} />;
}

export function DropdownMenuSeparator() {
  return <D.Separator className="my-1 h-px bg-border" />;
}
