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
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return (
    <>
      <PageHeader
        title="API keys"
        description="For CI pipelines and scripts that read from the Countersign API. A key can read everything in this organization, so keep it in a secret store."
        actions={isAdmin && keys.length > 0 && <CreateKey />}
      />
      {!isAdmin && <div className="mb-4"><AdminOnlyNotice what="API keys" /></div>}
      <div className="flex max-w-4xl flex-col gap-6">
        {keys.length === 0 ? (
          <div className="rounded-lg border">
            <EmptyState icon={KeyRound} title="No API keys" body="Create one to read repositories and reviews from CI or your own scripts." action={isAdmin ? <CreateKey /> : undefined} />
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
        <section aria-labelledby="api" className="flex flex-col gap-3">
          <h2 id="api" className="text-md font-semibold text-fg">Call the API</h2>
          <CodeBlock title="terminal" code={`export COUNTERSIGN_API_KEY=csk_...\ncurl -H "Authorization: Bearer $COUNTERSIGN_API_KEY" ${base}/api/v1/repositories\ncurl -H "Authorization: Bearer $COUNTERSIGN_API_KEY" ${base}/api/v1/reviews/<review id>`} />
          <p className="text-sm text-muted">Keys are read-only: they list repositories with their index status and fetch a review with its findings. Up to 600 requests a minute per key.</p>
        </section>
      </div>
    </>
  );
}
