"use client";
import * as React from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./button";

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          /* clipboard blocked: the text stays selectable */
        }
      }}
    >
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      <span aria-live="polite">{copied ? "Copied" : label}</span>
    </Button>
  );
}

export function CodeBlock({ code, title, className }: { code: string; title?: string; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-md border bg-surface-sunken", className)}>
      <div className="flex items-center justify-between border-b px-3 py-1">
        <span className="font-mono text-xs text-muted">{title}</span>
        <CopyButton value={code} />
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-sm leading-5 text-fg">
        <code>{code}</code>
      </pre>
    </div>
  );
}
