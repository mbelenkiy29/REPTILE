import type { Metadata } from "next";
import { getReviewConfig } from "@/lib/data";
import { requireOrg } from "@/lib/data/session";
import { relativeTime } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { AdminOnlyNotice } from "@/components/no-access";
import { ConfigForm } from "./config-form";

export const metadata: Metadata = { title: "Review settings" };

export default async function ReviewSettingsPage() {
  const ctx = await requireOrg();
  const view = await getReviewConfig(ctx, null);
  const readOnly = ctx.role !== "admin";
  return (
    <>
      <PageHeader
        title="Review settings"
        description={
          <>
            Defaults for every repository in {ctx.org.name}. A repository can override them in its own settings or with a reptile.json file.
            {view.updatedAt && <> Last changed {relativeTime(view.updatedAt)}{view.updatedBy && ` by ${view.updatedBy.name}`}.</>}
          </>
        }
      />
      {readOnly && <div className="mb-6"><AdminOnlyNotice what="review settings" /></div>}
      <div className="max-w-3xl">
        <ConfigForm repoId={null} initial={view.effective} readOnly={readOnly} scopeLabel="organization defaults" />
      </div>
    </>
  );
}
