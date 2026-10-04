import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./safe-next";

describe("safeRedirectPath (BUG-001)", () => {
  it("keeps same-site paths with their query and hash", () => {
    expect(safeRedirectPath("/reviews?status=completed#top")).toBe("/reviews?status=completed#top");
    expect(safeRedirectPath("/invite/abc_DEF-123")).toBe("/invite/abc_DEF-123");
  });

  it("refuses anything a browser would treat as another site", () => {
    for (const bad of ["//evil.example/x", "/\\evil.example", "\\\\evil.example", "/\t/evil.example", "/\n/evil.example", "https://evil.example/", "javascript:alert(1)", " /repos", "", null, undefined, 42]) {
      expect(safeRedirectPath(bad), String(bad)).toBe("/repos");
    }
  });

  it("uses the fallback given", () => {
    expect(safeRedirectPath("//x", "/onboarding")).toBe("/onboarding");
  });
});
