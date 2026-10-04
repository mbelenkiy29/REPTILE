"use client";
import { Toaster as Sonner } from "sonner";

export { toast } from "sonner";

export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      visibleToasts={3}
      duration={4000}
      toastOptions={{
        classNames: {
          toast: "!bg-bg !text-fg !border !border-border !shadow-pop !rounded-lg !font-sans !text-base",
          description: "!text-muted",
          error: "!text-danger",
          success: "!text-success",
        },
      }}
    />
  );
}
