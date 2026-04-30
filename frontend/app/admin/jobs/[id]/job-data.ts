import { cache } from "react";
import { backendFetch } from "@/lib/api";
import type { JobOut } from "@/types/api";

/** Dedupes `/jobs/:id` when layout + page both fetch in the same RSC pass. */
export const getCachedJob = cache(async (jobId: string): Promise<JobOut> => {
  return backendFetch<JobOut>(`/jobs/${jobId}`);
});
