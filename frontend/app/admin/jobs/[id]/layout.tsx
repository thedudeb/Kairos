import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { BackendError } from "@/lib/api";
import { JobWorkspaceProvider } from "./job-workspace-context";
import { cn } from "@/lib/utils";
import type { JobOut, JobStatus } from "@/types/api";
import { getCachedJob } from "./job-data";
import { JobNavTabs } from "./job-nav-tabs";

const STATUS_BADGE: Record<JobStatus, string> = {
  active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  draft: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  closed: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
};

export default async function JobWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let job: JobOut;
  try {
    job = await getCachedJob(id);
  } catch (e) {
    if (e instanceof BackendError && e.status === 404) notFound();
    throw e;
  }

  const session = await auth();

  return (
    <JobWorkspaceProvider value={{ isAdmin: session?.user?.role === "admin" }}>
      <div className="flex min-h-screen flex-col">
      {/* Job sub-header — sticky below main admin bar (h-14) so tabs stay clickable while scrolling */}
      {/* z-[45] below admin header (z-50), above page body (z-0) — otherwise long pages can
          paint over the tabs and swallow clicks while the window scrollbar still moves. */}
      <div className="sticky top-14 z-[45] border-b border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <div className="flex items-center gap-3 py-3 min-w-0">
            <Link
              href="/admin"
              className="shrink-0 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              Jobs
            </Link>
            <span className="shrink-0 text-zinc-300 dark:text-zinc-700">/</span>
            <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {job.title}
            </span>
            <span
              className={cn(
                "shrink-0 inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium",
                STATUS_BADGE[job.status],
              )}
            >
              {job.status}
            </span>
          </div>
          <JobNavTabs jobId={id} />
        </div>
      </div>

      <div className="relative z-0 flex-1">{children}</div>
      </div>
    </JobWorkspaceProvider>
  );
}
