/**
 * Next.js middleware — runs on the Edge before every matched request.
 *
 * Redirects unauthenticated visitors to /sign-in for all /admin routes so
 * they never reach a page that silently fails with an error message instead
 * of a proper login prompt.
 */
import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  if (!req.auth) {
    const signInUrl = new URL("/sign-in", req.nextUrl.origin);
    // Preserve the intended destination so we can redirect back after login.
    signInUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }
});

export const config = {
  // Match all /admin routes but skip Next.js internals and static assets.
  matcher: ["/admin/:path*"],
};
