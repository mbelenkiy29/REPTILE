import { notFound } from "next/navigation";
import { listReviews, getReview } from "@/lib/data";
import { requireOrg } from "@/lib/data/session";
import { fixPrompt } from "@/lib/fix-prompt";
import { FixView } from "../../fix-view";

export const metadata = { title: "Fix all with your agent" };

export default async function FixAllPage({ params }: PageProps<"/fix/pr/[id]">) {
  const ctx = await requireOrg();
  const { id } = await params;
  const { items } = await listReviews(ctx, { limit: 10_000 });
  const latest = items.find((r) => r.pr.id === id && r.status === "completed");
  if (!latest) notFound();
  const review = await getReview(ctx, latest.id);
  const open = review.findings.filter((f) => f.status === "open");
  return (
    <FixView
      title={`Fix ${open.length} open finding${open.length === 1 ? "" : "s"}`}
      repo={review.repo.fullName}
      reviewHref={`/reviews/${review.id}`}
      prompt={fixPrompt(review.repo.fullName, review.pr.number, open)}
    />
  );
}
