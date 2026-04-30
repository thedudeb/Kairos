import { notFound } from "next/navigation";
import { backendFetch } from "@/lib/api";
import type { ApplicantListItem } from "@/types/api";
import { PipelineShell } from "./pipeline-shell";

interface StageWithApplicants {
  id: string;
  name: string;
  sort_order: number;
  is_terminal: boolean;
  applicant_count: number;
}

async function fetchStages(jobId: string): Promise<StageWithApplicants[]> {
  try {
    return await backendFetch<StageWithApplicants[]>(
      `/jobs/${jobId}/pipeline/stages`,
    );
  } catch {
    return [];
  }
}

async function fetchApplicants(jobId: string): Promise<ApplicantListItem[]> {
  try {
    return await backendFetch<ApplicantListItem[]>(
      `/jobs/${jobId}/applicants?limit=200`,
    );
  } catch {
    return [];
  }
}

export default async function PipelinePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [stages, applicants] = await Promise.all([
    fetchStages(id),
    fetchApplicants(id),
  ]);

  if (!stages.length) notFound();

  // Group applicants by stage
  const byStage: Record<string, ApplicantListItem[]> = {};
  for (const stage of stages) {
    byStage[stage.id] = [];
  }
  for (const a of applicants) {
    if (byStage[a.current_stage_id] !== undefined) {
      byStage[a.current_stage_id].push(a);
    }
  }

  return (
    <PipelineShell jobId={id} stages={stages} byStage={byStage} />
  );
}
