import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";

import { BACKEND_URL } from "@/lib/constants";

/** Proxies authenticated PDF bytes so react-pdf runs same-origin (cookies + PDF.js range requests). */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string; applicantId: string }> },
) {
  const { jobId, applicantId } = await params;
  const session = await auth();
  if (!session?.backendToken) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const upstream = await fetch(
    `${BACKEND_URL}/jobs/${jobId}/applicants/${applicantId}/resume`,
    {
      headers: { Authorization: `Bearer ${session.backendToken}` },
    },
  );

  if (!upstream.ok) {
    return new NextResponse("Resume unavailable", { status: upstream.status });
  }

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Cache-Control": "private, max-age=120",
      "Content-Disposition": 'inline; filename="resume.pdf"',
    },
  });
}

/**
 * HEAD handler for the PDF viewer's pre-flight existence check.
 *
 * Without this, Next.js returns 405 for HEAD on a GET-only route. The viewer
 * reads `res.ok === false` and bails out to the "not available" fallback even
 * when the PDF actually exists. Mirrors the GET auth flow but doesn't stream
 * the body upstream — uses HEAD against the backend so we don't pay to
 * download the whole PDF just to check existence.
 */
export async function HEAD(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string; applicantId: string }> },
) {
  const { jobId, applicantId } = await params;
  const session = await auth();
  if (!session?.backendToken) {
    return new NextResponse(null, { status: 401 });
  }

  const upstream = await fetch(
    `${BACKEND_URL}/jobs/${jobId}/applicants/${applicantId}/resume`,
    {
      method: "HEAD",
      headers: { Authorization: `Bearer ${session.backendToken}` },
    },
  );

  return new NextResponse(null, { status: upstream.status });
}
