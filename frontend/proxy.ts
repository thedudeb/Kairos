import { auth } from "@/auth";
import { NextResponse } from "next/server";

const PUBLIC_PATHS = [
  "/",
  "/sign-in",
  "/api/auth",
  "/opengraph-image",
  "/icon",
];

const PUBLIC_PREFIXES = [
  "/careers",
  "/api/auth/",
  "/_next/",
  "/favicon",
];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  const isPublic =
    PUBLIC_PATHS.includes(pathname) ||
    PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));

  if (isPublic) return;

  if (!req.auth) {
    const url = req.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
