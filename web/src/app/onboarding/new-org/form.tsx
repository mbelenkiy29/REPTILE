"use client";
import * as React from "react";
import { createOrg } from "@/app/actions/session";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

export function NewOrgForm() {
  const [error, setError] = React.useState<string>();
  const [pending, start] = React.useTransition();
  return (
    <form
      className="mt-6 flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const name = String(new FormData(e.currentTarget).get("name") ?? "");
        start(async () => {
          const r = await createOrg(name);
          if (r && !r.ok) setError(r.error);
        });
      }}
    >
      <Field label="Organization name" hint="Usually your company or team. You can change it later." error={error}>
        {(p) => <Input {...p} name="name" required minLength={2} maxLength={60} autoFocus placeholder="Acme" />}
      </Field>
      <Button type="submit" loading={pending} className="self-start">Create organization</Button>
    </form>
  );
}
