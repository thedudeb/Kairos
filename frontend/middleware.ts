/**
 * Next.js middleware — protects every /admin route.
 *
 * Auth.js v5 wraps the handler so `req.auth` is the session object.
 * Unauthenticated requests are redirected to /sign-in with a callbackUrl
 * so the user lands back where they intended after signing in.
 */
import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth(function middleware(req) {
  if (!req.auth) {
    const signIn = new URL("/sign-in", req.url);
    signIn.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return NextResponse.redirect(signIn);
  }
});

export const config = {
  // Match all /admin routes. Exclude static assets and Next.js internals.
  matcher: ["/admin/:path*"],
};
