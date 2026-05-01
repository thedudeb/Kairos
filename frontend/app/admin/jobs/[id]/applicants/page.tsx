import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { backendFetch } from "@/lib/api";
import type { ApplicantListItem, JobOut, PipelineStage } from "@/types/api";
import { getCachedJob } from "../job-data";
import { ApplicantTable } from "./applicant-table";

async function fetchJob(jobId: string): Promise<JobOut | null> {
  try {
    return await getCachedJob(jobId);
  } catch {
    return null;
  }
}

async function fetchStages(jobId: string): Promise<PipelineStage[]> {
  try {
    return await backendFetch<PipelineStage[]>(`/jobs/${jobId}/pipeline-stages`);
  } catch {
    return [];
  }
}

async function fetchSkills(jobId: string): Promise<string[]> {
  try {
    return await backendFetch<string[]>(`/jobs/${jobId}/applicants/skills`);
  } catch {
    return [];
  }
}

async function fetchApplicants(
  jobId: string,
  params: Record<string, string | string[]>,
): Promise<ApplicantListItem[]> {
  try {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (Array.isArray(v)) {
        for (const item of v) sp.append(k, item);
      } else if (v) {
        sp.set(k, v);
      }
    }
    return await backendFetch<ApplicantListItem[]>(
      `/jobs/${jobId}/applicants?${sp.toString()}`,
    );
  } catch {
    return [];
  }
}

export default async function ApplicantsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[]>>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const skillsParam = sp.skills
    ? Array.isArray(sp.skills)
      ? sp.skills
      : [sp.skills]
    : [];

  const [job, stages, availableSkills, applicants] = await Promise.all([
    fetchJob(id),
    fetchStages(id),
    fetchSkills(id),
    fetchApplicants(id, {
      ...(sp.stage_id ? { stage_id: sp.stage_id as string } : {}),
      ...(sp.search ? { search: sp.search as string } : {}),
      ...(sp.institution ? { institution: sp.institution as string } : {}),
      ...(sp.degree ? { degree: sp.degree as string } : {}),
      ...(sp.date_from ? { date_from: sp.date_from as string } : {}),
      ...(sp.date_to ? { date_to: sp.date_to as string } : {}),
      ...(skillsParam.length ? { skills: skillsParam } : {}),
      sort_by: (sp.sort_by as string) || "submitted_at",
      sort_dir: (sp.sort_dir as string) || "desc",
      limit: "200",
    }),
  ]);

  if (!job) notFound();

  const session = await auth();
  const isAdmin = session?.user?.role === "admin";

  return (
    <div className="p-4 sm:p-6">
      <ApplicantTable
        jobId={id}
        applicants={applicants}
        stages={stages}
        availableSkills={availableSkills}
        activeStageId={(sp.stage_id as string) ?? null}
        searchQuery={(sp.search as string) ?? ""}
        activeInstitution={(sp.institution as string) ?? ""}
        activeDegree={(sp.degree as string) ?? ""}
        activeDateFrom={(sp.date_from as string) ?? ""}
        activeDateTo={(sp.date_to as string) ?? ""}
        activeSkills={skillsParam}
        sortBy={(sp.sort_by as string) || "submitted_at"}
        sortDir={(sp.sort_dir as string) || "desc"}
        canExport={isAdmin}
      />
    </div>
  );
}
