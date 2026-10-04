"use client";
import * as React from "react";
import { CircleAlert, CircleCheck } from "lucide-react";
import type { ReviewConfig } from "@/lib/data";
import { fileLayer, mergeConfig, toConfigFile, validateConfigText } from "@/lib/review/config";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const EXAMPLE = `{
  "strictness": 3,
  "commentTypes": ["logic", "security"],
  "ignorePatterns": ["**/*.snap", "vendor/**"],
  "excludeAuthors": ["*[bot]"]
}`;

export function Validator({ orgConfig }: { orgConfig: ReviewConfig }) {
  const [text, setText] = React.useState("");
  const deferred = React.useDeferredValue(text);
  const result = React.useMemo(() => (deferred.trim() ? validateConfigText(deferred) : null), [deferred]);
  const lines = text.split("\n").length;
  const badLines = new Set(result && !result.ok ? result.issues.map((i) => i.line).filter(Boolean) : []);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label htmlFor="config-text" className="text-sm font-medium text-fg">File contents</label>
          <Button variant="link" size="sm" type="button" onClick={() => setText(EXAMPLE)}>Insert an example</Button>
        </div>
        <div className="flex overflow-hidden rounded-md border border-border-input bg-bg focus-within:outline-2 focus-within:outline-focus">
          <div aria-hidden className="select-none border-r bg-surface px-2 py-2 text-right font-mono text-sm leading-5 text-muted">
            {Array.from({ length: Math.max(lines, 12) }, (_, i) => (
              <div key={i} className={cn(badLines.has(i + 1) && "font-semibold text-danger")}>{i + 1}</div>
            ))}
          </div>
          <textarea
            id="config-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            aria-describedby="config-result"
            aria-invalid={result ? !result.ok : undefined}
            placeholder='{ "strictness": 2 }'
            rows={Math.max(lines, 12)}
            className="min-h-60 flex-1 resize-y bg-transparent px-3 py-2 font-mono text-sm leading-5 text-fg outline-none placeholder:text-muted"
          />
        </div>
      </div>

      <div id="config-result" aria-live="polite" className="flex flex-col gap-4">
        {!result ? (
          <p className="text-muted">Paste a file on the left; it&apos;s checked as you type.</p>
        ) : result.ok ? (
          <>
            <p className="flex items-center gap-2 font-medium text-success"><CircleCheck className="size-4" aria-hidden /> Valid. Here&apos;s what would apply:</p>
            <Card title="Effective settings" description="This file on top of your organization defaults.">
              <pre tabIndex={0} aria-label="Effective settings" className="overflow-auto rounded-md border bg-surface-sunken p-3 font-mono text-sm text-fg">
                {JSON.stringify(toConfigFile(mergeConfig(orgConfig, fileLayer(result.config))), null, 2)}
              </pre>
            </Card>
          </>
        ) : (
          <>
            <p className="flex items-center gap-2 font-medium text-danger">
              <CircleAlert className="size-4" aria-hidden /> {result.issues.length === 1 ? "1 problem" : `${result.issues.length} problems`}
            </p>
            <ul className="flex flex-col gap-2">
              {result.issues.map((i, k) => (
                <li key={k} className="rounded-md border border-transparent bg-danger-soft px-3 py-2 text-sm">
                  <span className="font-medium text-danger">{i.line ? `Line ${i.line}` : "File"}{i.path && ` · ${i.path}`}</span>
                  <span className="block text-fg">{i.message}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
