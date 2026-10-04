"use client";
import * as React from "react";
import { Switch as S } from "radix-ui";
import { cn } from "@/lib/cn";

export function Switch({ className, saving, ...props }: React.ComponentProps<typeof S.Root> & { saving?: boolean }) {
  return (
    <S.Root
      aria-busy={saving || undefined}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-pill bg-border-strong transition-colors",
        "data-[state=checked]:bg-accent disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        saving && "opacity-70",
        className,
      )}
      {...props}
    >
      <S.Thumb className="block size-4 translate-x-0.5 rounded-pill bg-bg shadow-card transition-transform duration-[var(--motion-fast)] data-[state=checked]:translate-x-[18px]" />
    </S.Root>
  );
}
