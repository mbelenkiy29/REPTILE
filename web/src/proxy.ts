import { NextResponse, type NextRequest } from "next/server";

// Fake auth gate: no session cookie → sign-in page. /replica-backend swaps the cookie check for Auth.js.
export function proxy(req: NextRequest) {
  if (req.cookies.get("rp_session")) return NextResponse.next();
  const url = new URL("/login", req.url);
  const next = req.nextUrl.pathname + req.nextUrl.search;
  if (next !== "/") url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except the sign-in page, the design reference, invite links, API routes and static files.
  matcher: ["/((?!login|design|invite|api|_next/static|_next/image|favicon.ico).*)"],
};
