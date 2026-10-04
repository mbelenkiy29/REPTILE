import { Lock } from "lucide-react";
import { Alert } from "./ui/alert";

/** Shown in place of admin-only controls when a member views them. */
export function AdminOnlyNotice({ what }: { what: string }) {
  return (
    <Alert variant="info" title="View only">
      <span className="inline-flex items-center gap-1.5">
        <Lock className="size-3.5" aria-hidden /> Only admins can change {what}. Ask an admin in this organization if something needs to change.
      </span>
    </Alert>
  );
}
