"use client";
import * as React from "react";
import { MoreHorizontal, UserMinus, UserPlus } from "lucide-react";
import type { Role } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, Input } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { invite, remove, revoke, setRole } from "./actions";

const ROLES = [
  { value: "member", label: "Member" },
  { value: "admin", label: "Admin" },
];

export function InviteDialog() {
  const [open, setOpen] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [role, setRoleState] = React.useState<Role>("member");
  const [error, setError] = React.useState<string>();
  const [pending, start] = React.useTransition();
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setEmail(""); setError(undefined); } }}>
      <DialogTrigger asChild><Button size="sm"><UserPlus aria-hidden /> Invite</Button></DialogTrigger>
      <DialogContent title="Invite a teammate" description="They get an email with a link that works for 7 days.">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await invite(email, role);
              if (!r.ok) return setError(r.error);
              toast.success(`Invite sent to ${email.trim()}`);
              setOpen(false);
              setEmail("");
            });
          }}
        >
          <Field label="Email" error={error}>
            {(p) => <Input {...p} type="email" required autoFocus value={email} onChange={(e) => { setEmail(e.target.value); setError(undefined); }} placeholder="dev@company.com" />}
          </Field>
          <Field label="Role" hint="Admins can change settings, members and billing. Members can see everything.">
            {(p) => <Select {...p} value={role} onValueChange={(v) => setRoleState(v as Role)} options={ROLES} />}
          </Field>
          <div className="mt-2 flex justify-end gap-2">
            <DialogClose asChild><Button variant="secondary">Cancel</Button></DialogClose>
            <Button type="submit" loading={pending}>Send invite</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RoleSelect({ userId, name, role }: { userId: string; name: string; role: Role }) {
  const [value, setValue] = React.useState(role);
  const [pending, start] = React.useTransition();
  return (
    <Select
      aria-label={`Role for ${name}`}
      className="w-32"
      value={value}
      disabled={pending}
      onValueChange={(v) => {
        const prev = value;
        setValue(v as Role);
        start(async () => {
          const r = await setRole(userId, v as Role);
          if (r.ok) toast.success(`${name} is now ${v === "admin" ? "an admin" : "a member"}`);
          else { setValue(prev); toast.error(r.error); }
        });
      }}
      options={ROLES}
    />
  );
}

export function MemberRowActions({ userId, name }: { userId: string; name: string }) {
  const [confirm, setConfirm] = React.useState(false);
  const [pending, start] = React.useTransition();
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${name}`}><MoreHorizontal aria-hidden /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem destructive onSelect={() => setConfirm(true)}><UserMinus aria-hidden /> Remove from organization</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Remove ${name}?`}
        description="They lose access right away and stop counting as a seat. Their past reviews and comments stay."
        confirmLabel="Remove"
        loading={pending}
        onConfirm={() => start(async () => {
          const r = await remove(userId);
          setConfirm(false);
          if (r.ok) toast.success(`${name} removed`);
          else toast.error(r.error);
        })}
      />
    </>
  );
}

export function RevokeInvite({ id, email }: { id: string; email: string }) {
  const [pending, start] = React.useTransition();
  return (
    <Button variant="ghost" size="sm" loading={pending} onClick={() => start(async () => {
      const r = await revoke(id);
      if (r.ok) toast.success(`Invite for ${email} cancelled`);
      else toast.error(r.error);
    })}>
      Cancel invite
    </Button>
  );
}
