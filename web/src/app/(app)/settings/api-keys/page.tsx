import type { Metadata } from "next";
import { KeyRound } from "lucide-react";
import { listApiKeys } from "@/lib/data";
import { requireOrg } from "@/lib/data/session";
import { relativeTime } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { AdminOnlyNotice } from "@/components/no-access";
import { Badge } from "@/components/ui/badge";
import { CodeBlock } from "@/components/ui/code-block";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TD, TH, THead, TRow } from "@/components/ui/table";
import { CreateKey, RevokeKey } from "./client";

export const metadata: Metadata = { title: "API keys" };

export default async function ApiKeysPage() {
  const ctx = await requireOrg();
  const keys = await listApiKeys(ctx);
  const isAdmin = ctx.role === "admin";
  return (
    <>
      <PageHeader
        title="API keys"
        description="For the REPTILE CLI, CI pipelines and the API. A key acts for the whole organization, so keep it in a secret store."
        actions={isAdmin && keys.length > 0 && <CreateKey />}
      />
      {!isAdmin && <div className="mb-4"><AdminOnlyNotice what="API keys" /></div>}
      <div className="flex max-w-4xl flex-col gap-6">
        {keys.length === 0 ? (
          <div className="rounded-lg border">
            <EmptyState icon={KeyRound} title="No API keys" body="Create one to review branches from your terminal or call the API from CI." action={isAdmin ? <CreateKey /> : undefined} />
          </div>
        ) : (
          <Table aria-label="API keys">
            <THead>
              <tr>
                <TH>Name</TH>
                <TH>Key</TH>
                <TH className="hidden md:table-cell">Created by</TH>
                <TH className="hidden sm:table-cell">Last used</TH>
                <TH><span className="sr-only">Actions</span></TH>
              </tr>
            </THead>
            <tbody>
              {keys.map((k) => (
                <TRow key={k.id} className={k.revokedAt ? "text-muted" : undefined}>
                  <TD className="max-w-[220px] truncate font-medium">{k.name}{k.revokedAt && <Badge className="ml-2">Revoked</Badge>}</TD>
                  <TD className="font-mono text-sm text-muted">{k.prefix}…</TD>
                  <TD className="hidden text-sm text-muted md:table-cell">{k.createdByName} · {relativeTime(k.createdAt)}</TD>
                  <TD className="hidden text-sm text-muted sm:table-cell">{k.lastUsedAt ? relativeTime(k.lastUsedAt) : "Never"}</TD>
                  <TD className="text-right">{isAdmin && !k.revokedAt && <RevokeKey id={k.id} name={k.name} />}</TD>
                </TRow>
              ))}
            </tbody>
          </Table>
        )}
        <section aria-labelledby="cli" className="flex flex-col gap-3">
          <h2 id="cli" className="text-md font-semibold text-fg">Review from your terminal</h2>
          <CodeBlock title="terminal" code={`npm install -g reptile-cli\nexport REPTILE_API_KEY=rpt_...\nreptile review            # this branch against main\nreptile review -b develop # against another branch`} />
          <p className="text-sm text-muted">The CLI ships with the backend; the commands above show how it will work.</p>
        </section>
      </div>
    </>
  );
}
