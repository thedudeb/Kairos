import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { backendFetch, BackendError } from "@/lib/api";
import type { JobOut, TemplateSummary } from "@/types/api";
import { getCachedJob } from "../job-data";
import { JobSettingsEditor } from "./job-settings-editor";

export default async function JobSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let job: JobOut;
  let templates: TemplateSummary[];

  try {
    [job, templates] = await Promise.all([
      getCachedJob(id),
      backendFetch<TemplateSummary[]>("/templates/"),
    ]);
  } catch (e) {
    if (e instanceof BackendError && e.status === 404) notFound();
    throw e;
  }

  const session = await auth();
  const isAdmin = session?.user?.role === "admin";

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <h1 className="mb-6 text-lg font-semibold tracking-tight">Job settings</h1>
      <JobSettingsEditor job={job} templates={templates} readOnly={!isAdmin} />
    </div>
  );
}
