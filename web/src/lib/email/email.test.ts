import { describe, expect, it } from "vitest";
import { render } from "./templates";

describe("email templates", () => {
  it("escape names that contain HTML", () => {
    const m = render("invite", { org: "<script>x</script>", inviter: "Bob & Co", role: "member", url: "https://app/invite/t" });
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;script&gt;");
    expect(m.text).toContain("https://app/invite/t");
    expect(m.subject).toBe("Bob & Co invited you to <script>x</script> on REPTILE");
  });
  it("every template renders with a subject and a text part", () => {
    for (const t of ["signin", "invite", "payment-failed", "trial-ending"]) {
      const m = render(t, { url: "https://x", org: "Acme", inviter: "A", role: "admin", days: "3" });
      expect(m.subject.length).toBeGreaterThan(5);
      expect(m.text.length).toBeGreaterThan(20);
    }
    expect(() => render("nope", {})).toThrow();
  });
});
