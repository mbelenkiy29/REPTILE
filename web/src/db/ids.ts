import { createHash } from "node:crypto";

/** Deterministic UUID for a seed key like "r_api", so tests and scripts can address seeded rows. */
export function seedId(key: string): string {
  const h = createHash("sha1").update(`reptile-seed:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
