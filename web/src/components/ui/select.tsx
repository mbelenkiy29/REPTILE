"use client";
import * as React from "react";
import { Select as S } from "radix-ui";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

export function Select({
  value,
  onValueChange,
  options,
  placeholder,
  className,
  ...rest
}: {
  value?: string;
  onValueChange: (v: string) => void;
  options: { value: string; label: React.ReactNode; disabled?: boolean }[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}) {
  const { disabled, ...triggerProps } = rest;
  return (
    <S.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <S.Trigger
        {...triggerProps}
        className={cn(
          "inline-flex h-8 w-full items-center justify-between gap-2 rounded-md border border-border-input bg-bg px-2.5 text-base text-fg",
          "hover:border-border-strong focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-50",
          "data-[placeholder]:text-muted aria-[invalid=true]:border-danger",
          className,
        )}
      >
        <S.Value placeholder={placeholder} />
        <S.Icon>
          <ChevronDown className="size-4 text-muted" aria-hidden />
        </S.Icon>
      </S.Trigger>
      <S.Portal>
        <S.Content
          position="popper"
          sideOffset={4}
          className="z-[var(--z-dropdown)] max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border bg-bg p-1 shadow-pop"
        >
          <S.Viewport>
            {options.map((o) => (
              <S.Item
                key={o.value}
                value={o.value}
                disabled={o.disabled}
                className="relative flex h-8 cursor-default select-none items-center rounded-md pl-7 pr-2 text-base text-fg outline-none data-[disabled]:opacity-50 data-[highlighted]:bg-surface"
              >
                <S.ItemIndicator className="absolute left-2">
                  <Check className="size-3.5" aria-hidden />
                </S.ItemIndicator>
                <S.ItemText>{o.label}</S.ItemText>
              </S.Item>
            ))}
          </S.Viewport>
        </S.Content>
      </S.Portal>
    </S.Root>
  );
}
