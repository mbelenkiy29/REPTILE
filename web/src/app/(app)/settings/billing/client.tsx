"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { checkout, portal } from "./actions";

export function CheckoutButton({ className }: { className?: string }) {
  const [pending, start] = React.useTransition();
  return (
    <Button size="sm" className={className} loading={pending} onClick={() => start(async () => {
      const r = await checkout();
      if (r && !r.ok) toast.error(r.error);
    })}>
      Choose the Team plan
    </Button>
  );
}

export function PortalButton({ label = "Manage billing" }: { label?: string }) {
  const [pending, start] = React.useTransition();
  return (
    <Button size="sm" variant="secondary" loading={pending} onClick={() => start(async () => {
      const r = await portal();
      if (r && !r.ok) toast.error(r.error);
    })}>
      {label}
    </Button>
  );
}
