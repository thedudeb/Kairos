import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

async function proxy(req: NextRequest, jobId: string, extra = "") {
  const session = await auth();
  if (!session?.backendToken) return new NextResponse("Unauthorized", { status: 401 });
  const url = `${BACKEND_URL}/jobs/${jobId}/pipeline/stages${extra}`;
  const body = req.method !== "GET" && req.method !== "DELETE"
    ? await req.text()
    : undefined;
  const res = await fetch(url, {
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

export async function GET(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return proxy(req, jobId);
}
export async function POST(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return proxy(req, jobId);
}
export async function PUT(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return proxy(req, jobId);
}
