"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";

import { BACKEND_URL } from "@/lib/constants";

async function authedFetch(path: string, init: RequestInit = {}) {
  const session = await auth();
  const token = session?.backendToken;
  return fetch(`${BACKEND_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

export async function createIntegration(
  jobId: string,
  data: {
    stage_id: string;
    endpoint_url: string;
    api_key: string;
    include_assessment: boolean;
  },
): Promise<{ ok: boolean; error?: string }> {
  const res = await authedFetch(`/jobs/${jobId}/integrations`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return { ok: false, error: (err as { detail?: string }).detail ?? "Failed to create integration" };
  }
  revalidatePath(`/admin/jobs/${jobId}/integrations`);
  return { ok: true };
}

export async function updateIntegration(
  jobId: string,
  integrationId: string,
  data: {
    endpoint_url?: string;
    api_key?: string;
    include_assessment?: boolean;
    is_active?: boolean;
  },
): Promise<{ ok: boolean; error?: string }> {
  const res = await authedFetch(
    `/jobs/${jobId}/integrations/${integrationId}`,
    { method: "PUT", body: JSON.stringify(data) },
  );
  if (!res.ok) return { ok: false, error: "Failed to update integration" };
  revalidatePath(`/admin/jobs/${jobId}/integrations`);
  return { ok: true };
}

export async function deleteIntegration(
  jobId: string,
  integrationId: string,
): Promise<{ ok: boolean }> {
  const res = await authedFetch(
    `/jobs/${jobId}/integrations/${integrationId}`,
    { method: "DELETE" },
  );
  revalidatePath(`/admin/jobs/${jobId}/integrations`);
  return { ok: res.ok };
}

export async function retryDelivery(
  jobId: string,
  integrationId: string,
  deliveryId: string,
): Promise<{ ok: boolean }> {
  const res = await authedFetch(
    `/jobs/${jobId}/integrations/${integrationId}/deliveries/${deliveryId}/retry`,
    { method: "POST" },
  );
  return { ok: res.ok };
}

export async function testIntegration(
  jobId: string,
  integrationId: string,
): Promise<{ ok: boolean; status?: number; body?: string; error?: string }> {
  const res = await authedFetch(
    `/jobs/${jobId}/integrations/${integrationId}/test`,
    { method: "POST" },
  );
  if (!res.ok) return { ok: false, error: "Request failed" };
  return res.json();
}
