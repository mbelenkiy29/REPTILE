"use client";
import * as React from "react";
import { Pencil } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { toast } from "@/components/ui/toaster";
import { saveDoc } from "./actions";

export function DocBody({ repoId, id, body, canEdit }: { repoId: string; id: string; body: string; canEdit: boolean }) {
  const [editing, setEditing] = React.useState(false);
  const [text, setText] = React.useState(body);
  const [pending, start] = React.useTransition();
  if (!editing) {
    return (
      <div className="flex flex-col gap-4">
        <Markdown className="max-w-3xl">{body}</Markdown>
        {canEdit && (
          <div>
            <Button size="sm" variant="secondary" onClick={() => { setText(body); setEditing(true); }}><Pencil aria-hidden /> Edit page</Button>
            <p className="mt-2 text-sm text-muted">Edited pages are kept as you wrote them; REPTILE won&apos;t overwrite them on the next index.</p>
          </div>
        )}
      </div>
    );
  }
  return (
    <form className="flex max-w-3xl flex-col gap-3" onSubmit={(e) => {
      e.preventDefault();
      start(async () => {
        const r = await saveDoc(repoId, id, text);
        if (!r.ok) return void toast.error(r.error);
        toast.success("Page saved");
        setEditing(false);
      });
    }}>
      <label htmlFor="doc-text" className="text-sm font-medium text-fg">Markdown</label>
      <Textarea id="doc-text" value={text} onChange={(e) => setText(e.target.value)} rows={18} className="font-mono text-sm" autoFocus />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
        <Button type="submit" loading={pending}>Save page</Button>
      </div>
    </form>
  );
}
