"use client";
import * as React from "react";
import { Tooltip as T } from "radix-ui";

export const TooltipProvider = T.Provider;

export function Tooltip({ content, children }: { content: React.ReactNode; children: React.ReactNode }) {
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          sideOffset={6}
          className="z-[var(--z-tooltip)] max-w-64 rounded-md bg-text px-2 py-1 text-xs text-bg shadow-pop"
        >
          {content}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
