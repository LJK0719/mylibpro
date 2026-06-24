import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "libpro_auth";

const PUBLIC_PREFIXES = ["/login", "/api/auth", "/api/v1", "/api/mcp"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow static assets (files with extensions)
  if (pathname.includes(".")) {
    return NextResponse.next();
  }

  // Check auth cookie
  const cookie = request.cookies.get(COOKIE_NAME);
  const validPassword = process.env.SITE_PASSWORD;

  if (validPassword && cookie?.value === validPassword) {
    return NextResponse.next();
  }

  // Redirect to login
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("redirect", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    // Match all paths except Next.js internals and static files
    "/((?!_next|favicon.ico|katex).*)",
  ],
};
