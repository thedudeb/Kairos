import { backendFetch } from "@/lib/api";
import type { PipelineStage } from "@/types/api";
import { IntegrationsEditor } from "./integrations-editor";

interface IntegrationOut {
  id: string;
  job_id: string;
  stage_id: string;
  stage_name: string;
  endpoint_url: string;
  api_key_masked: string;
  include_assessment: boolean;
  is_active: boolean;
}

async function fetchIntegrations(jobId: string): Promise<IntegrationOut[]> {
  try {
    return await backendFetch<IntegrationOut[]>(`/jobs/${jobId}/integrations`);
  } catch {
    return [];
  }
}

async function fetchStages(jobId: string): Promise<PipelineStage[]> {
  try {
    return await backendFetch<PipelineStage[]>(`/jobs/${jobId}/pipeline/stages`);
  } catch {
    return [];
  }
}

export default async function IntegrationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [integrations, stages] = await Promise.all([
    fetchIntegrations(id),
    fetchStages(id),
  ]);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <IntegrationsEditor
        jobId={id}
        integrations={integrations}
        stages={stages}
      />
    </div>
  );
}
