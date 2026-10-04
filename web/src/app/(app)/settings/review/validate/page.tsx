import type { Metadata } from "next";
import { getReviewConfig } from "@/lib/data";
import { requireOrg } from "@/lib/data/session";
import { PageHeader } from "@/components/page-header";
import { Validator } from "./validator";

export const metadata: Metadata = { title: "Check a config file" };

export default async function ValidatePage() {
  const ctx = await requireOrg();
  const { effective } = await getReviewConfig(ctx, null);
  return (
    <>
      <PageHeader
        crumbs={[{ href: "/settings/review", label: "Review settings" }]}
        title="Check a config file"
        description="Paste reptile.json or a .reptile/config.json before you commit it. Nothing is saved; this only checks the file and shows what would apply."
      />
      <Validator orgConfig={effective} />
    </>
  );
}
