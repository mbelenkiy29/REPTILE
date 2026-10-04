"use client";
import * as React from "react";
import { ToggleGroup } from "radix-ui";
import { cn } from "@/lib/cn";

export function Segmented<T extends string>({
  value,
  onValueChange,
  options,
  label,
  disabled,
  className,
}: {
  value: T;
  onValueChange: (v: T) => void;
  options: { value: T; label: React.ReactNode }[];
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      // Radix sends "" when the active item is clicked again; keep a value selected.
      onValueChange={(v) => v && onValueChange(v as T)}
      aria-label={label}
      disabled={disabled}
      className={cn("inline-flex w-fit rounded-md border bg-surface-sunken p-0.5", className)}
    >
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          className={cn(
            "h-7 min-w-12 rounded-sm px-3 text-sm font-medium text-muted transition-colors hover:text-fg",
            "data-[state=on]:bg-bg data-[state=on]:text-fg data-[state=on]:shadow-card",
            "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:opacity-50",
          )}
        >
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
