"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { checkout } from "./actions";

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

/** Opens the Stripe customer portal once /replica-backend wires Stripe. */
export function PortalButton() {
  return (
    <Button size="sm" variant="secondary" onClick={() => toast.info("Card, invoices and cancellation open in Stripe's portal once billing is connected.")}>
      Manage billing
    </Button>
  );
}
