import { NextResponse, type NextRequest } from "next/server";

// Cheap gate: no session cookie → sign-in page. Pages still verify the session against the database (requireOrg).
const SESSION_COOKIES = ["authjs.session-token", "__Secure-authjs.session-token"];

export function proxy(req: NextRequest) {
  if (SESSION_COOKIES.some((c) => req.cookies.get(c))) return NextResponse.next();
  const url = new URL("/login", req.url);
  const next = req.nextUrl.pathname + req.nextUrl.search;
  if (next !== "/") url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except the sign-in page, the design reference, invite links, API routes and static files.
  matcher: ["/((?!login|design|invite|api|_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
