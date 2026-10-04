import * as React from "react";
import { CircleAlert } from "lucide-react";
import { cn } from "@/lib/cn";

const control =
  "w-full rounded-md border border-border-input bg-bg px-2.5 text-base text-fg placeholder:text-muted " +
  "transition-colors hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-focus " +
  "disabled:cursor-not-allowed disabled:opacity-50 read-only:bg-surface aria-[invalid=true]:border-danger";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, "h-8", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, "min-h-20 resize-y py-1.5", className)} {...props} />;
}

type FieldRender = { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean };

/** Label + control + hint + error, wired with ids. Pass the control as a render function. */
export function Field({
  label,
  hint,
  error,
  optional,
  className,
  children,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  optional?: boolean;
  className?: string;
  children: (props: FieldRender) => React.ReactNode;
}) {
  const id = React.useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {label}
        {optional && <span className="ml-1 font-normal text-muted">(optional)</span>}
      </label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {hint && !error && (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="flex items-center gap-1 text-sm text-danger">
          <CircleAlert className="size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}
