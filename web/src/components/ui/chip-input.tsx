"use client";
import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

export function ChipInput({
  value,
  onChange,
  placeholder,
  validate,
  disabled,
  id,
  className,
  ...aria
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  /** Return an error message to reject an entry. */
  validate?: (entry: string) => string | undefined;
  disabled?: boolean;
  id?: string;
  className?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}) {
  const [draft, setDraft] = React.useState("");
  const [error, setError] = React.useState<string>();
  const [announce, setAnnounce] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  function add(raw: string) {
    const entries = raw.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    const next = [...value];
    for (const e of entries) {
      const msg = validate?.(e);
      if (msg) {
        setError(msg);
        setDraft(e);
        return;
      }
      if (!next.includes(e)) next.push(e);
    }
    setError(undefined);
    setDraft("");
    if (next.length !== value.length) {
      onChange(next);
      setAnnounce(`Added ${entries.join(", ")}`);
    }
  }

  function remove(v: string) {
    onChange(value.filter((x) => x !== v));
    setAnnounce(`Removed ${v}`);
    inputRef.current?.focus();
  }

  return (
    <div>
      <div
        onClick={() => inputRef.current?.focus()}
        className={cn(
          "flex min-h-8 w-full cursor-text flex-wrap items-center gap-1 rounded-md border border-border-input bg-bg px-1.5 py-1",
          "hover:border-border-strong focus-within:outline-2 focus-within:outline-focus",
          (error || aria["aria-invalid"]) && "border-danger",
          disabled && "pointer-events-none opacity-50",
          className,
        )}
      >
        {value.map((v) => (
          <span key={v} className="inline-flex h-6 items-center gap-1 rounded-sm border bg-surface-sunken pl-1.5 font-mono text-xs text-fg">
            {v}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                remove(v);
              }}
              aria-label={`Remove ${v}`}
              className="grid size-5 place-items-center rounded-sm text-muted hover:bg-surface hover:text-fg focus-visible:outline-2 focus-visible:outline-focus"
            >
              <X className="size-3" aria-hidden />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          value={draft}
          disabled={disabled}
          placeholder={value.length ? undefined : placeholder}
          aria-describedby={aria["aria-describedby"]}
          aria-invalid={error ? true : aria["aria-invalid"]}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(undefined);
          }}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === ",") && draft.trim()) {
              e.preventDefault();
              add(draft);
            } else if (e.key === "Backspace" && !draft && value.length) {
              remove(value[value.length - 1]);
            }
          }}
          onBlur={() => draft.trim() && add(draft)}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (/[,\n]/.test(text)) {
              e.preventDefault();
              add(text);
            }
          }}
          className="h-6 min-w-24 flex-1 bg-transparent px-1 text-base text-fg outline-none placeholder:text-muted"
        />
      </div>
      {error && <p className="mt-1.5 text-sm text-danger">{error}</p>}
      <span className="sr-only" aria-live="polite">
        {announce}
      </span>
    </div>
  );
}
