import { getFinding, getReview } from "@/lib/data";
import { orNotFound } from "@/lib/data/guard";
import { requireOrg } from "@/lib/data/session";
import { fixPrompt } from "@/lib/fix-prompt";
import { FixView } from "../fix-view";

export const metadata = { title: "Fix with your agent" };

export default async function FixFindingPage({ params }: PageProps<"/fix/[id]">) {
  const ctx = await requireOrg();
  const finding = await orNotFound(getFinding(ctx, (await params).id));
  const review = await getReview(ctx, finding.firstReviewId);
  return (
    <FixView
      title={finding.title}
      repo={review.repo.fullName}
      reviewHref={`/reviews/${review.id}`}
      prompt={fixPrompt(review.repo.fullName, review.pr.number, [finding])}
    />
  );
}
