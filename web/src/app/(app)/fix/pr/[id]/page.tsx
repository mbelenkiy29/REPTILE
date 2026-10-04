import { notFound } from "next/navigation";
import { getReview, latestCompletedReviewId } from "@/lib/data";
import { requireOrg } from "@/lib/data/session";
import { fixPrompt } from "@/lib/fix-prompt";
import { FixView } from "../../fix-view";

export const metadata = { title: "Fix all with your agent" };

export default async function FixAllPage({ params }: PageProps<"/fix/pr/[id]">) {
  const ctx = await requireOrg();
  const { id } = await params;
  const latest = await latestCompletedReviewId(ctx, id);
  if (!latest) notFound();
  const review = await getReview(ctx, latest);
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
