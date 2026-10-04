"use client";
import * as React from "react";
import { Plus, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";
import { ConfirmDialog, Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { toast } from "@/components/ui/toaster";
import { create, revoke } from "./actions";

export function CreateKey() {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [secret, setSecret] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string>();
  const [pending, start] = React.useTransition();
  const close = () => { setOpen(false); setSecret(null); setName(""); setError(undefined); };
  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : secret ? undefined : close())}>
      <DialogTrigger asChild><Button size="sm"><Plus aria-hidden /> Create key</Button></DialogTrigger>
      {secret ? (
        <DialogContent
          title="Copy your new key"
          description="This is the only time it's shown. Store it somewhere safe now."
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <div className="flex flex-col gap-4">
            <CodeBlock title={name} code={secret} />
            <p className="flex items-start gap-2 text-sm text-warning"><TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> If you lose it, revoke it and create a new one.</p>
            <Button className="self-end" onClick={close}>I&apos;ve saved it</Button>
          </div>
        </DialogContent>
      ) : (
        <DialogContent title="Create an API key" description="Name it after where it will be used.">
          <form className="flex flex-col gap-4" onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await create(name);
              if (!r.ok) return setError(r.error);
              setSecret(r.data);
            });
          }}>
            <Field label="Name" error={error}>
              {(p) => <Input {...p} required autoFocus maxLength={60} value={name} onChange={(e) => { setName(e.target.value); setError(undefined); }} placeholder="CI pipeline" />}
            </Field>
            <div className="mt-2 flex justify-end gap-2">
              <DialogClose asChild><Button variant="secondary">Cancel</Button></DialogClose>
              <Button type="submit" loading={pending}>Create key</Button>
            </div>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
}

export function RevokeKey({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      trigger={<Button variant="ghost" size="sm">Revoke</Button>}
      title={`Revoke “${name}”?`}
      description="Anything using this key stops working immediately. This can't be undone."
      confirmLabel="Revoke key"
      loading={pending}
      onConfirm={() => start(async () => {
        const r = await revoke(id);
        setOpen(false);
        if (r.ok) toast.success("Key revoked");
        else toast.error(r.error);
      })}
    />
  );
}
