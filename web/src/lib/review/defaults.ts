import type { ReviewConfig } from "@/lib/data/types";

/** What applies when nothing is configured. */
export const DEFAULT_CONFIG: ReviewConfig = {
  strictness: 2,
  commentTypes: ["logic", "syntax", "style"],
  reviewDrafts: false,
  includeLabels: [],
  disabledLabels: [],
  includeAuthors: [],
  excludeAuthors: [],
  includeBranches: [],
  excludeBranches: [],
  ignorePatterns: [],
  summary: { diagram: true, fileTable: true, confidence: true },
};
