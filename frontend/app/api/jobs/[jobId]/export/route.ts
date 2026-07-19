import { NextRequest, NextResponse } from "next/server";
import { getBackendToken } from "@/lib/api";

import { BACKEND_URL } from "@/lib/constants";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  const token = await getBackendToken();
  if (!token) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const upstream = await fetch(
    `${BACKEND_URL}/jobs/${jobId}/export/applicants.csv`,
    { headers: { Authorization: `Bearer ${token}` } },
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
