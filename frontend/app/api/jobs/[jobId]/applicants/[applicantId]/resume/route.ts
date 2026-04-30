import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

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
