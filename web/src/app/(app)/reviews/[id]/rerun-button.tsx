"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { rerun } from "../actions";

export function RerunButton({ reviewId, disabled, label }: { reviewId: string; disabled?: boolean; label: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <Button
      size="sm"
      disabled={disabled}
      loading={pending}
      onClick={() =>
        start(async () => {
          const r = await rerun(reviewId);
          if (!r.ok) return void toast.error(r.error);
          toast.success("Review queued");
          router.push(`/reviews/${r.data}`);
        })
      }
    >
      {!pending && <RotateCw aria-hidden />} {label}
    </Button>
  );
}
