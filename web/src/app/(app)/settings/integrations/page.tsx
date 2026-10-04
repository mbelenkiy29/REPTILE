import type { Metadata } from "next";
import { listIntegrations, type IntegrationKind } from "@/lib/data";
import { requireOrg } from "@/lib/data/session";
import { relativeTime } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { AdminOnlyNotice } from "@/components/no-access";
import { IntegrationCard } from "./client";

export const metadata: Metadata = { title: "Integrations" };

const CATALOG: { kind: IntegrationKind; name: string; what: string }[] = [
  { kind: "linear", name: "Linear", what: "Reads the issue a pull request closes, so reviews check the change against what was asked." },
  { kind: "jira", name: "Jira", what: "Same as Linear, for Jira issues linked in the branch name or description." },
  { kind: "slack", name: "Slack", what: "Posts critical findings to a channel and answers questions about your code." },
  { kind: "notion", name: "Notion", what: "Reads design docs and runbooks you choose, as extra context for reviews." },
  { kind: "datadog", name: "Datadog", what: "Flags changes to code paths that recently showed errors in production." },
];

export default async function IntegrationsPage() {
  const ctx = await requireOrg();
  const connected = await listIntegrations(ctx);
  const isAdmin = ctx.role === "admin";
  return (
    <>
      <PageHeader title="Integrations" description="Give reviews context from the tools your team already uses. Each connection is read-only." />
      {!isAdmin && <div className="mb-4"><AdminOnlyNotice what="integrations" /></div>}
      <div className="grid max-w-5xl gap-4 md:grid-cols-2 xl:grid-cols-3">
        {CATALOG.map((c) => {
          const i = connected.find((x) => x.kind === c.kind);
          return (
            <IntegrationCard
              key={c.kind}
              kind={c.kind}
              name={c.name}
              what={c.what}
              status={i?.status ?? "disconnected"}
              detail={i ? `${i.detail ?? ""}${i.status === "connected" ? ` · ${relativeTime(i.updatedAt)}` : ""}` : null}
              canEdit={isAdmin}
            />
          );
        })}
      </div>
    </>
  );
}
