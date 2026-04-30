import Link from "next/link";
import { Plus } from "lucide-react";
import { backendFetch, BackendError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { CollapsibleSection } from "@/components/admin/collapsible-section";
import type { JobListItem, JobStatus } from "@/types/api";

const STATUS_ORDER: JobStatus[] = ["active", "draft", "closed"];
const STATUS_LABEL: Record<JobStatus, string> = {
  active: "Active",
  draft: "Draft",
  closed: "Closed",
};
const STATUS_BADGE: Record<JobStatus, string> = {
  active:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  draft:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  closed:
    "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
};

function isLikelyNetworkFailure(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("fetch failed") ||
    m.includes("econnrefused") ||
    m.includes("connecterror") ||
    m.includes("networkerror") ||
    m.includes("socket")
  );
}

export default async function AdminLandingPage() {
  let jobs: JobListItem[] = [];
  let error: string | null = null;

  try {
    jobs = await backendFetch<JobListItem[]>("/jobs/");
  } catch (e) {
    error = e instanceof BackendError ? `${e.status}: ${e.body}` : String(e);
  }

  const apiBase = process.env.BACKEND_URL ?? "http://localhost:8000";

  if (error) {
    const network = isLikelyNetworkFailure(error);
    return (
      <div className="mx-auto max-w-4xl px-6 py-10">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-400">
          <p className="font-medium">Could not load jobs</p>
          <p className="mt-1 font-mono text-xs opacity-90">{error}</p>
          {network && (
            <div className="mt-4 space-y-2 border-t border-red-200/80 pt-3 text-xs text-red-800/90 dark:border-red-800/50 dark:text-red-300/90">
              <p>
                This usually means the <strong>FastAPI backend is not reachable</strong> from the Next.js
                server. The app is trying: <code className="rounded bg-red-100/80 px-1 py-0.5 font-mono dark:bg-red-950/50">{apiBase}</code>
              </p>
              <ol className="list-decimal space-y-1 pl-4">
                <li>
                  Start Postgres/Redis if you use Docker:{" "}
                  <code className="rounded bg-red-100/80 px-1 font-mono dark:bg-red-950/50">docker compose up -d</code>
                </li>
                <li>
                  Start the API (from repo root):{" "}
                  <code className="rounded bg-red-100/80 px-1 font-mono dark:bg-red-950/50">
                    cd backend && uv run uvicorn app.main:app --reload --port 8000
                  </code>
                </li>
                <li>
                  Confirm <code className="font-mono">{apiBase}/docs</code> opens in your browser.
                </li>
                <li>
                  If the API runs elsewhere, set <code className="font-mono">BACKEND_URL</code> in{" "}
                  <code className="font-mono">frontend/.env.local</code> (and restart{" "}
                  <code className="font-mono">pnpm dev</code>).
                </li>
              </ol>
            </div>
          )}
        </div>
      </div>
    );
  }

  const grouped = STATUS_ORDER.reduce<Record<JobStatus, JobListItem[]>>(
    (acc, s) => {
      acc[s] = jobs.filter((j) => j.status === s);
      return acc;
    },
    { active: [], draft: [], closed: [] },
  );

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Jobs</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Select a job to enter its workspace, or create a new one.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/templates"
            className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Templates
          </Link>
          <Link
            href="/admin/jobs/new"
            className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            <Plus className="h-4 w-4" />
            New job
          </Link>
        </div>
      </div>

      {jobs.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-10">
          {STATUS_ORDER.map((status) => {
            const list = grouped[status];
            if (list.length === 0) return null;

            const header = (
              <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                <span
                  className={cn(
                    "inline-flex items-center rounded px-2 py-0.5 text-xs font-medium",
                    STATUS_BADGE[status],
                  )}
                >
                  {STATUS_LABEL[status]}
                </span>
                <span className="text-zinc-400">({list.length})</span>
              </h2>
            );

            const cards = (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((job) => (
                  <JobCard key={job.id} job={job} />
                ))}
              </div>
            );

            if (status === "closed") {
              return (
                <CollapsibleSection key={status} header={header} defaultOpen={false}>
                  {cards}
                </CollapsibleSection>
              );
            }

            return (
              <section key={status}>
                {header}
                <div className="mb-4" />
                {cards}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function JobCard({ job }: { job: JobListItem }) {
  const { summary } = job;
  const totalOnBoard = summary.stage_distribution.reduce((s, d) => s + d.count, 0);

  return (
    <Link
      href={`/admin/jobs/${job.id}`}
      className="group block rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition-all hover:border-zinc-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <h3 className="font-medium text-zinc-900 group-hover:text-zinc-700 dark:text-zinc-100 dark:group-hover:text-zinc-300 line-clamp-2">
          {job.title}
        </h3>
        <span
          className={cn(
            "shrink-0 inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium",
            STATUS_BADGE[job.status],
          )}
        >
          {STATUS_LABEL[job.status]}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Total" value={summary.total_applicants} />
        <Stat label="This week" value={summary.new_this_week} />
        <Stat label="This month" value={summary.new_this_month} />
      </div>

      {summary.stage_distribution.some((d) => d.count > 0) && (
        <div className="mt-4 space-y-1">
          {summary.stage_distribution
            .filter((d) => d.count > 0)
            .slice(0, 4)
            .map((d) => (
              <div key={d.stage_id} className="flex items-center gap-2 text-xs text-zinc-500">
                <div className="flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <div
                    className="h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500"
                    style={{
                      width: `${Math.round((d.count / Math.max(totalOnBoard, 1)) * 100)}%`,
                    }}
                  />
                </div>
                <span className="w-6 text-right font-medium">{d.count}</span>
                <span className="w-24 truncate">{d.stage_name}</span>
              </div>
            ))}
        </div>
      )}

      <p className="mt-3 text-xs text-zinc-400">/careers/{job.slug}</p>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-zinc-50 p-2 dark:bg-zinc-800">
      <div className="text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
        {value}
      </div>
      <div className="text-xs text-zinc-500">{label}</div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-200 py-24 text-center dark:border-zinc-800">
      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">No jobs yet</p>
      <p className="mt-1 text-sm text-zinc-500">
        Create your first job listing to get started.
      </p>
      <Link
        href="/admin/jobs/new"
        className="mt-6 inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
      >
        <Plus className="h-4 w-4" />
        New job
      </Link>
    </div>
  );
}
