// Decides whether a pull request gets an automatic review, and if not, why not.
// The reasons are shown on the check run and in review history, so they're written for people.
import picomatch from "picomatch";
import type { ReviewConfig, ReviewTrigger } from "@/lib/data/types";

export interface PrFacts {
  isDraft: boolean;
  authorLogin: string;
  baseBranch: string;
  labels: string[];
  changedFiles: string[];
  trigger: ReviewTrigger;
}

export type Decision = { review: true; files: string[] } | { review: false; reason: string };

const any = (patterns: string[], value: string) => patterns.some((p) => picomatch.isMatch(value, p, { dot: true, nocase: true }));

export function shouldReview(c: ReviewConfig, pr: PrFacts): Decision {
  // An explicit request (mention, re-run, CLI) overrides the automatic filters, except ignored files.
  const explicit = pr.trigger === "mention" || pr.trigger === "manual" || pr.trigger === "cli" || pr.trigger === "api";

  if (!explicit) {
    if (pr.isDraft && !c.reviewDrafts) return { review: false, reason: "Draft pull request" };
    if (c.excludeAuthors.length && any(c.excludeAuthors, pr.authorLogin))
      return { review: false, reason: "Author is excluded in review settings" };
    if (c.includeAuthors.length && !any(c.includeAuthors, pr.authorLogin))
      return { review: false, reason: "Author isn't on the review list" };
    if (c.excludeBranches.length && any(c.excludeBranches, pr.baseBranch))
      return { review: false, reason: `Base branch ${pr.baseBranch} is excluded` };
    if (c.includeBranches.length && !any(c.includeBranches, pr.baseBranch))
      return { review: false, reason: `Base branch ${pr.baseBranch} isn't on the review list` };
    if (c.disabledLabels.length && pr.labels.some((l) => any(c.disabledLabels, l)))
      return { review: false, reason: "Has a label that turns reviews off" };
    if (c.includeLabels.length && !pr.labels.some((l) => any(c.includeLabels, l)))
      return { review: false, reason: "Doesn't have a label that turns reviews on" };
  }

  const files = c.ignorePatterns.length ? pr.changedFiles.filter((f) => !any(c.ignorePatterns, f)) : pr.changedFiles;
  if (!files.length) return { review: false, reason: "Only ignored files changed" };
  return { review: true, files };
}
