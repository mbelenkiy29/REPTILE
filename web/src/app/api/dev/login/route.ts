import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { devLoginEnabled } from "@/auth";
import { db, schema as s } from "@/db";
import { safeRedirectPath } from "@/lib/safe-next";

// Local/CI sign-in as a seeded user (AUTH_DEV_LOGIN=1 and APP_URL on localhost only). 404 everywhere else.
export async function GET(req: Request) {
  if (!devLoginEnabled()) return new NextResponse("Not found", { status: 404 });
  const url = new URL(req.url);
  const email = url.searchParams.get("email") ?? "jordan@acme.dev";
  const next = url.searchParams.get("next") ?? "/repos";
  const [user] = await db.select().from(s.users).where(eq(s.users.email, email));
  if (!user) return new NextResponse(`No user with email ${email}. Run npm run db:seed.`, { status: 404 });
  const token = randomBytes(32).toString("hex");
  await db.insert(s.sessions).values({ sessionToken: token, userId: user.id, expires: new Date(Date.now() + 86400_000) });
  const res = NextResponse.redirect(new URL(safeRedirectPath(next), url));
  res.cookies.set("authjs.session-token", token, { httpOnly: true, sameSite: "lax", path: "/" });
  if (url.searchParams.get("org")) res.cookies.set("rp_org", url.searchParams.get("org")!, { httpOnly: true, sameSite: "lax", path: "/" });
  return res;
}
