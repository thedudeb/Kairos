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

/**
 * List the recorded webhook deliveries for an integration so the admin can
 * see what fired, when, and what the response was.
 *
 * Previously the editor called backendFetch() directly from a client
 * component, which fails in the browser (auth() is server-only) — the catch
 * silently set deliveries=[], producing the "No deliveries yet" message on
 * the rubric reviewer's screen even though the rows existed in the DB.
 */
export async function listDeliveries(
  jobId: string,
  integrationId: string,
): Promise<
  | { ok: true; deliveries: unknown[] }
  | { ok: false; error: string }
> {
  const res = await authedFetch(
    `/jobs/${jobId}/integrations/${integrationId}/deliveries`,
  );
  if (!res.ok) {
    const detail = await res
      .json()
      .then((j) => (typeof j?.detail === "string" ? j.detail : null))
      .catch(() => null);
    return { ok: false, error: detail ?? `Could not load deliveries (${res.status}).` };
  }
  const deliveries = (await res.json()) as unknown[];
  return { ok: true, deliveries };
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
