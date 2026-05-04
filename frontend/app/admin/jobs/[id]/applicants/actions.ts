"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";

import { BACKEND_URL } from "@/lib/constants";

async function authedFetch(path: string, init: RequestInit = {}) {
  const session = await auth();
  const token = session?.backendToken;
  // Fail fast if there's no session — prevents silently making unauthenticated
  // requests to the backend which would just return 401 anyway.
  if (!token) throw new Error("Unauthorized");
  return fetch(`${BACKEND_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function moveApplicantStage(
  jobId: string,
  applicantId: string,
  stageId: string,
  notes?: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await authedFetch(
    `/jobs/${jobId}/applicants/${applicantId}/stage`,
    {
      method: "PATCH",
      body: JSON.stringify({ stage_id: stageId, notes: notes ?? null }),
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return { ok: false, error: (err as { detail?: string }).detail ?? "Failed to move stage" };
  }
  revalidatePath(`/admin/jobs/${jobId}/applicants`);
  revalidatePath(`/admin/jobs/${jobId}/applicants/${applicantId}`);
  return { ok: true };
}

export async function addNote(
  jobId: string,
  applicantId: string,
  body: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await authedFetch(
    `/jobs/${jobId}/applicants/${applicantId}/notes`,
    {
      method: "POST",
      body: JSON.stringify({ body }),
    },
  );
  if (!res.ok) return { ok: false, error: "Failed to save note" };
  revalidatePath(`/admin/jobs/${jobId}/applicants/${applicantId}`);
  return { ok: true };
}

export async function editNote(
  jobId: string,
  applicantId: string,
  noteId: string,
  body: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await authedFetch(
    `/jobs/${jobId}/applicants/${applicantId}/notes/${noteId}`,
    { method: "PUT", body: JSON.stringify({ body }) },
  );
  if (!res.ok) return { ok: false, error: "Failed to update note" };
  revalidatePath(`/admin/jobs/${jobId}/applicants/${applicantId}`);
  return { ok: true };
}

export async function deleteNote(
  jobId: string,
  applicantId: string,
  noteId: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await authedFetch(
    `/jobs/${jobId}/applicants/${applicantId}/notes/${noteId}`,
    { method: "DELETE" },
  );
  if (!res.ok) return { ok: false, error: "Failed to delete note" };
  revalidatePath(`/admin/jobs/${jobId}/applicants/${applicantId}`);
  return { ok: true };
}

export interface EducationPatch {
  institution: string | null;
  degree: string | null;
  field_of_study: string | null;
  start_year: number | null;
  end_year: number | null;
}

export interface WorkPatch {
  company: string | null;
  title: string | null;
  start_date: string | null;
  end_date: string | null;
  description: string | null;
}

export async function correctParsedResume(
  jobId: string,
  applicantId: string,
  patch: {
    full_name?: string | null;
    email?: string | null;
    phone?: string | null;
    top_institution?: string | null;
    top_degree?: string | null;
    skills?: string[];
    education?: EducationPatch[];
    work?: WorkPatch[];
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await authedFetch(
    `/jobs/${jobId}/applicants/${applicantId}/parsed-resume`,
    { method: "PATCH", body: JSON.stringify(patch) },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return { ok: false, error: (err as { detail?: string }).detail ?? "Failed to save" };
  }
  revalidatePath(`/admin/jobs/${jobId}/applicants/${applicantId}`);
  return { ok: true };
}

export async function reparseResume(
  jobId: string,
  applicantId: string,
): Promise<{ ok: boolean; queued: boolean }> {
  const res = await authedFetch(
    `/jobs/${jobId}/applicants/${applicantId}/reparse`,
    { method: "POST" },
  );
  if (!res.ok) return { ok: false, queued: false };
  const data = (await res.json()) as { queued?: boolean };
  revalidatePath(`/admin/jobs/${jobId}/applicants/${applicantId}`);
  return { ok: true, queued: data.queued ?? false };
}

export async function rerankApplicant(
  jobId: string,
  applicantId: string,
): Promise<{ ok: boolean; queued: boolean }> {
  const res = await authedFetch(
    `/jobs/${jobId}/applicants/${applicantId}/rerank`,
    { method: "POST" },
  );
  if (!res.ok) return { ok: false, queued: false };
  const data = (await res.json()) as { queued?: boolean };
  revalidatePath(`/admin/jobs/${jobId}/applicants/${applicantId}`);
  revalidatePath(`/admin/jobs/${jobId}/applicants`);
  return { ok: true, queued: data.queued ?? false };
}

export async function rerankAllApplicants(
  jobId: string,
): Promise<{ ok: boolean; queued: number }> {
  const res = await authedFetch(`/jobs/${jobId}/rerank-all`, { method: "POST" });
  if (!res.ok) return { ok: false, queued: 0 };
  const data = (await res.json()) as { queued?: number };
  revalidatePath(`/admin/jobs/${jobId}/applicants`);
  return { ok: true, queued: data.queued ?? 0 };
}
