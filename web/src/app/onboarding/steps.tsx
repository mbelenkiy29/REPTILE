import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

const STEPS = ["Connect a code host", "Link your account", "Open a pull request"];

export function Steps({ current }: { current: 0 | 1 | 2 }) {
  return (
    <ol className="mb-8 flex flex-col gap-2 sm:flex-row sm:gap-6" aria-label="Setup progress">
      {STEPS.map((s, i) => (
        <li key={s} className="flex items-center gap-2 text-sm" aria-current={i === current ? "step" : undefined}>
          <span
            className={cn(
              "grid size-6 shrink-0 place-items-center rounded-pill border text-xs font-semibold",
              i < current && "border-transparent bg-success-soft text-success",
              i === current && "border-transparent bg-accent text-on-accent",
              i > current && "text-muted",
            )}
          >
            {i < current ? <Check className="size-3.5" aria-label="Done" /> : i + 1}
          </span>
          <span className={cn(i === current ? "font-medium text-fg" : "text-muted")}>{s}</span>
        </li>
      ))}
    </ol>
  );
}
