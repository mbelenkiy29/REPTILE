"use client";
import * as React from "react";
import { deleteAccount } from "@/app/actions/session";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";

export function DeleteAccount({ email }: { email: string }) {
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState<string>();
  const [pending, start] = React.useTransition();
  return (
    <Dialog>
      <DialogTrigger asChild><Button variant="danger" size="sm">Delete my account</Button></DialogTrigger>
      <DialogContent title="Delete your account?" description="This can't be undone." size="sm">
        <form className="flex flex-col gap-4" onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await deleteAccount(value);
            if (r && !r.ok) setError(r.error);
          });
        }}>
          <Field label={`Type ${email} to confirm`} error={error}>
            {(p) => <Input {...p} value={value} onChange={(e) => { setValue(e.target.value); setError(undefined); }} autoComplete="off" />}
          </Field>
          <div className="flex justify-end gap-2">
            <DialogClose asChild><Button variant="secondary">Cancel</Button></DialogClose>
            <Button type="submit" variant="danger" loading={pending} disabled={value.trim().toLowerCase() !== email.toLowerCase()}>Delete account</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
