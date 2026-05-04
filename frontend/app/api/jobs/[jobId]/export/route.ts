import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";

import { BACKEND_URL } from "@/lib/constants";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  const session = await auth();
  if (!session?.backendToken) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const upstream = await fetch(
    `${BACKEND_URL}/jobs/${jobId}/export/applicants.csv`,
    { headers: { Authorization: `Bearer ${session.backendToken}` } },
  );

  if (!upstream.ok) {
    return new NextResponse("Export failed", { status: upstream.status });
  }

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="applicants-${jobId}.csv"`,
    },
  });
}
