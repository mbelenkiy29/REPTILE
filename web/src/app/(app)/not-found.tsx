import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function NotFound() {
  return (
    <EmptyState
      icon={SearchX}
      title="We couldn't find that"
      body="It may have been deleted, or it belongs to another organization. Switch organizations from the menu at the top left."
      action={<Button asChild size="sm"><Link href="/repos">Go to repositories</Link></Button>}
    />
  );
}
