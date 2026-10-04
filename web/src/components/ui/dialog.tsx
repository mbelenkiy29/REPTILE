"use client";
import * as React from "react";
import { Dialog as D, AlertDialog as A } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./button";

const overlay = "fixed inset-0 z-[var(--z-modal)] bg-overlay/50";
const panel =
  "fixed left-1/2 top-1/2 z-[var(--z-modal)] max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 " +
  "overflow-y-auto rounded-xl border bg-bg p-6 shadow-pop";
const widths = { sm: "max-w-[400px]", md: "max-w-[520px]", lg: "max-w-[720px]" };

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  title,
  description,
  size = "md",
  children,
  footer,
  className,
  ...props
}: Omit<React.ComponentProps<typeof D.Content>, "title"> & {
  title: React.ReactNode;
  description?: React.ReactNode;
  size?: keyof typeof widths;
  footer?: React.ReactNode;
}) {
  return (
    <D.Portal>
      <D.Overlay className={overlay} />
      <D.Content className={cn(panel, widths[size], className)} {...props}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <D.Title className="text-md font-semibold text-fg">{title}</D.Title>
            {description ? (
              <D.Description className="text-sm text-muted">{description}</D.Description>
            ) : (
              <D.Description className="sr-only">{title}</D.Description>
            )}
          </div>
          <D.Close asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Close">
              <X aria-hidden />
            </Button>
          </D.Close>
        </div>
        {children}
        {footer && <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div>}
      </D.Content>
    </D.Portal>
  );
}

/** Destructive confirmation. Cancel gets focus first, never the destructive button. */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  onConfirm,
  loading,
  open,
  onOpenChange,
}: {
  trigger?: React.ReactNode;
  title: React.ReactNode;
  description: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}) {
  return (
    <A.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <A.Trigger asChild>{trigger}</A.Trigger>}
      <A.Portal>
        <A.Overlay className={overlay} />
        <A.Content className={cn(panel, widths.sm)}>
          <A.Title className="text-md font-semibold text-fg">{title}</A.Title>
          <A.Description className="mt-1 text-sm text-muted">{description}</A.Description>
          <div className="mt-6 flex justify-end gap-2">
            <A.Cancel asChild>
              <Button variant="secondary">Cancel</Button>
            </A.Cancel>
            <Button
              variant="danger"
              loading={loading}
              onClick={async () => {
                await onConfirm();
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </A.Content>
      </A.Portal>
    </A.Root>
  );
}
