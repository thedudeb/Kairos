import { NextRequest, NextResponse } from "next/server";

const TRUSTED_ORIGINS = [
  process.env.NEXTAUTH_URL,
  process.env.NEXT_PUBLIC_APP_URL,
].filter(Boolean) as string[];

export function rejectCrossOriginMutation(req: NextRequest): NextResponse | null {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    return null;
  }

  const secFetchSite = req.headers.get("sec-fetch-site");
  if (secFetchSite && !["same-origin", "same-site", "none"].includes(secFetchSite)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const origin = req.headers.get("origin");
  if (!origin) return null;

  const requestOrigin = new URL(req.url).origin;
  if (origin === requestOrigin || TRUSTED_ORIGINS.includes(origin)) {
    return null;
  }

  return new NextResponse("Forbidden", { status: 403 });
}
