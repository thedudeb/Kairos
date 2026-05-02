import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { rejectCrossOriginMutation } from "@/lib/request-guards";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

async function proxy(req: NextRequest, jobId: string, stageId: string) {
  const rejected = rejectCrossOriginMutation(req);
  if (rejected) return rejected;

  const session = await auth();
  if (!session?.backendToken) return new NextResponse("Unauthorized", { status: 401 });
  const body = req.method !== "GET" && req.method !== "DELETE"
    ? await req.text()
    : undefined;
  const res = await fetch(`${BACKEND_URL}/jobs/${jobId}/pipeline/stages/${stageId}`, {
    method: req.method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.backendToken}`,
    },
    body,
  });
  if (res.status === 204) return new NextResponse(null, { status: 204 });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ jobId: string; stageId: string }> }) {
  const { jobId, stageId } = await params;
  return proxy(req, jobId, stageId);
}
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ jobId: string; stageId: string }> }) {
  const { jobId, stageId } = await params;
  return proxy(req, jobId, stageId);
}
