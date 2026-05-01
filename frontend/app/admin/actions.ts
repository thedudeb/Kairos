"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { backendFetch, BackendError } from "@/lib/api";
import type {
  AssessmentQuestionItem,
  FormFieldItem,
  JobOut,
  JobStatus,
  TemplateOut,
} from "@/types/api";

// ─── Templates ────────────────────────────────────────────────────────────────

export async function createTemplate(data: {
  name: string;
  description: string;
  form_fields: Omit<FormFieldItem, "id">[];
  assessment_questions: Omit<AssessmentQuestionItem, "id">[];
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const t = await backendFetch<TemplateOut>("/templates/", {
      method: "POST",
      body: JSON.stringify(data),
    });
    revalidatePath("/admin/templates");
    return { ok: true, id: t.id };
  } catch (e) {
    return { ok: false, error: e instanceof BackendError ? e.body : String(e) };
  }
}

export async function updateTemplate(
  id: string,
  data: {
    name: string;
    description: string;
    form_fields: Omit<FormFieldItem, "id">[];
    assessment_questions: Omit<AssessmentQuestionItem, "id">[];
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await backendFetch<TemplateOut>(`/templates/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
    revalidatePath(`/admin/templates/${id}`);
    revalidatePath("/admin/templates");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof BackendError ? e.body : String(e) };
  }
}

export async function deleteTemplate(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await backendFetch(`/templates/${id}`, { method: "DELETE" });
    revalidatePath("/admin/templates");
    redirect("/admin/templates");
  } catch (e) {
    if ((e as Error).message === "NEXT_REDIRECT") throw e;
    return { ok: false, error: e instanceof BackendError ? e.body : String(e) };
  }
}

export async function duplicateTemplate(id: string): Promise<{ ok: true; newId: string } | { ok: false; error: string }> {
  try {
    const t = await backendFetch<TemplateOut>(`/templates/${id}/duplicate`, { method: "POST" });
    revalidatePath("/admin/templates");
    return { ok: true, newId: t.id };
  } catch (e) {
    return { ok: false, error: e instanceof BackendError ? e.body : String(e) };
  }
}

// ─── Jobs ─────────────────────────────────────────────────────────────────────

export async function createJob(data: {
  title: string;
  slug?: string;
  description_md: string;
  template_id?: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const job = await backendFetch<JobOut>("/jobs/", {
      method: "POST",
      body: JSON.stringify(data),
    });
    revalidatePath("/admin");
    return { ok: true, id: job.id };
  } catch (e) {
    return { ok: false, error: e instanceof BackendError ? e.body : String(e) };
  }
}

export async function updateJobMeta(
  id: string,
  data: {
    title?: string;
    slug?: string;
    description_md?: string;
    description_kind?: "markdown" | "external";
    description_external_url?: string | null;
    description_summary?: string | null;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await backendFetch<JobOut>(`/jobs/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
    revalidatePath(`/admin/jobs/${id}`);
    revalidatePath("/admin");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof BackendError ? e.body : String(e) };
  }
}

export async function updateJobFormFields(
  jobId: string,
  form_fields: Omit<FormFieldItem, "id">[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await backendFetch(`/jobs/${jobId}`, {
      method: "PUT",
      body: JSON.stringify({ form_fields }),
    });
    revalidatePath(`/admin/jobs/${jobId}/settings`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof BackendError ? e.body : String(e) };
  }
}

export async function updateJobAssessmentQuestions(
  jobId: string,
  assessment_questions: Omit<AssessmentQuestionItem, "id">[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await backendFetch(`/jobs/${jobId}`, {
      method: "PUT",
      body: JSON.stringify({ assessment_questions }),
    });
    revalidatePath(`/admin/jobs/${jobId}/settings`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof BackendError ? e.body : String(e) };
  }
}

export async function applyTemplate(
  jobId: string,
  templateId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await backendFetch(`/jobs/${jobId}/apply-template`, {
      method: "POST",
      body: JSON.stringify({ template_id: templateId }),
    });
    revalidatePath(`/admin/jobs/${jobId}/settings`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof BackendError ? e.body : String(e) };
  }
}

export async function updateJobStatus(
  jobId: string,
  jobStatus: JobStatus,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await backendFetch(`/jobs/${jobId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: jobStatus }),
    });
    revalidatePath("/admin");
    revalidatePath(`/admin/jobs/${jobId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof BackendError ? e.body : String(e) };
  }
}

export async function deleteJob(id: string): Promise<void> {
  await backendFetch(`/jobs/${id}`, { method: "DELETE" });
  revalidatePath("/admin");
  redirect("/admin");
}
