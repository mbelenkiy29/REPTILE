"use client";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex max-w-[var(--layout-form-max)] flex-col gap-4 py-10">
      <Alert
        variant="danger"
        live
        title="This page didn't load"
        action={<Button size="sm" variant="secondary" onClick={reset}>Try again</Button>}
      >
        Nothing was changed. Try again in a moment; if it keeps happening, send us the error id below.
        {error.digest && <span className="mt-2 block font-mono text-xs text-muted">Error id: {error.digest}</span>}
      </Alert>
    </div>
  );
}
