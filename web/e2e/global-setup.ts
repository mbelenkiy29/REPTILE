import { execFileSync } from "node:child_process";

// Fresh seed data before every run, so specs can rely on the seeded orgs, people and reviews.
export default function globalSetup() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/localhost|127\.0\.0\.1/.test(url)) throw new Error("e2e reseeds DATABASE_URL; it must be a local database.");
  execFileSync("npx", ["tsx", "db/seed.ts", "--reset"], { stdio: "inherit", env: process.env });
}
