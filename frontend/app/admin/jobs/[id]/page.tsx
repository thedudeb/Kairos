import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { Users, TrendingUp, Calendar, Layers } from "lucide-react";
import { backendFetch, BackendError } from "@/lib/api";
import { getCachedJob } from "./job-data";
import { updateJobStatus } from "@/app/admin/actions";
import { AnalyticsCharts } from "@/components/admin/analytics-charts";

async function changeStatus(id: string, s: Parameters<typeof updateJobStatus>[1]) {
  "use server";
  await updateJobStatus(id, s);
}

interface AnalyticsData {
  total_applicants: number;
  volume_days: number;
  volume_range_start: string;
  volume_range_end: string;
  volume_by_day: { date: string; count: number }[];
  stage_distribution: { name: string; count: number }[];
  top_institutions: { name: string; count: number }[];
  degree_distribution: { name: string; count: number }[];
  parse_status_distribution: { name: string; count: number }[];
}

async function fetchAnalytics(
  jobId: string,
  args:
    | { mode: "preset"; volumeDays: number }
    | { mode: "custom"; volumeFrom: string; volumeTo: string },
): Promise<AnalyticsData | null> {
  try {
    const q = new URLSearchParams();
    if (args.mode === "custom") {
      q.set("volume_from", args.volumeFrom);
      q.set("volume_to", args.volumeTo);
    } else {
      q.set("volume_days", String(args.volumeDays));
    }
    return await backendFetch<AnalyticsData>(`/jobs/${jobId}/analytics?${q}`);
  } catch {
    return null;
  }
}

function validIsoDate(s: string | undefined): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// Lightweight markdown renderer (server-side, no extra deps)
function MarkdownContent({ markdown }: { markdown: string }) {
  const paragraphs = markdown.split(/\n{2,}/);
  return (
    <div className="space-y-3">
      {paragraphs.map((para, i) => {
        const trimmed = para.trim();
        if (!trimmed) return null;
        if (trimmed.startsWith("# ")) {
          return (
            <h2 key={i} className="mt-2 text-base font-semibold text-zinc-900 dark:text-zinc-100">
              {trimmed.slice(2)}
            </h2>
          );
        }
        if (trimmed.startsWith("## ")) {
          return (
            <h3 key={i} className="mt-1 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              {trimmed.slice(3)}
            </h3>
          );
        }
        if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
          const items = trimmed.split("\n").filter(Boolean);
          return (
            <ul key={i} className="ml-4 list-disc space-y-1">
              {items.map((item, j) => (
                <li key={j} className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                  {item.replace(/^[-*]\s/, "")}
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            {trimmed}
          </p>
        );
      })}
    </div>
  );
}

export default async function JobOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ volume_days?: string; volume_from?: string; volume_to?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  let volumeCustomActive = false;
  let presetDaysForToolbar = 30;
  let analyticsFetchArgs:
    | { mode: "preset"; volumeDays: number }
    | { mode: "custom"; volumeFrom: string; volumeTo: string };

  if (
    validIsoDate(sp.volume_from) &&
    validIsoDate(sp.volume_to) &&
    sp.volume_from <= sp.volume_to
  ) {
    volumeCustomActive = true;
    analyticsFetchArgs = {
      mode: "custom",
      volumeFrom: sp.volume_from,
      volumeTo: sp.volume_to,
    };
  } else {
    let volumeDays = parseInt(sp.volume_days ?? "30", 10);
    if (Number.isNaN(volumeDays)) volumeDays = 30;
    volumeDays = Math.min(366, Math.max(7, volumeDays));
    presetDaysForToolbar = volumeDays;
    analyticsFetchArgs = { mode: "preset", volumeDays };
  }

  // Fire job, analytics, and session in parallel — they are independent.
  const [jobResult, analytics, session] = await Promise.all([
    getCachedJob(id).then(
      (j) => ({ ok: true as const, job: j }),
      (e: unknown) => ({ ok: false as const, error: e }),
    ),
    fetchAnalytics(id, analyticsFetchArgs),
    auth(),
  ]);

  if (!jobResult.ok) {
    if (jobResult.error instanceof BackendError && jobResult.error.status === 404) {
      notFound();
    }
    throw jobResult.error;
  }
  const job = jobResult.job;
  const { summary } = job;
  const isAdmin = session?.user?.role === "admin";

  const inPipeline = summary.stage_distribution.reduce((s, d) => s + d.count, 0);

  const statusConfig = {
    active: {
      badge: "bg-emerald-500/15 text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400",
      dot: "bg-emerald-500 animate-pulse",
    },
    draft: {
      badge: "bg-amber-500/15 text-amber-600 ring-1 ring-amber-500/20 dark:text-amber-400",
      dot: "bg-amber-500",
    },
    closed: {
      badge: "bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700",
      dot: "bg-zinc-400",
    },
  }[job.status];

  const stats = [
    {
      label: "Total applicants",
      value: summary.total_applicants,
      icon: Users,
      color: "text-indigo-600 dark:text-indigo-400",
      bg: "bg-indigo-500/10",
    },
    {
      label: "This week",
      value: summary.new_this_week,
      icon: TrendingUp,
      color: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-500/10",
    },
    {
      label: "This month",
      value: summary.new_this_month,
      icon: Calendar,
      color: "text-sky-600 dark:text-sky-400",
      bg: "bg-sky-500/10",
    },
    {
      label: "In pipeline",
      value: inPipeline,
      icon: Layers,
      color: "text-violet-600 dark:text-violet-400",
      bg: "bg-violet-500/10",
    },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">

      {/* ── Header ── */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-100">
            {job.title}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 sm:gap-3">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${statusConfig.badge}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${statusConfig.dot}`} />
              {job.status}
            </span>
            <code className="truncate font-mono text-xs text-zinc-400 sm:text-sm">/careers/{job.slug}</code>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 sm:shrink-0">
          {isAdmin && job.status === "draft" && (
            <form action={changeStatus.bind(null, id, "active")} className="w-full sm:w-auto">
              <button
                type="submit"
                className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 sm:w-auto"
              >
                Publish job
              </button>
            </form>
          )}
          {isAdmin && job.status === "active" && (
            <form action={changeStatus.bind(null, id, "closed")} className="w-full sm:w-auto">
              <button
                type="submit"
                className="w-full rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 sm:w-auto dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Close job
              </button>
            </form>
          )}
          {isAdmin && job.status === "closed" && (
            <form action={changeStatus.bind(null, id, "active")} className="w-full sm:w-auto">
              <button
                type="submit"
                className="w-full rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 sm:w-auto dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Re-open job
              </button>
            </form>
          )}
          <Link
            href={`/admin/jobs/${id}/settings`}
            className="flex-1 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-center text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 sm:flex-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Edit settings
          </Link>
          {job.status === "active" ? (
            <Link
              href={`/careers/${job.slug}`}
              target="_blank"
              className="flex-1 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-center text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 sm:flex-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              View portal ↗
            </Link>
          ) : (
            <span className="flex-1 cursor-not-allowed rounded-lg border border-zinc-200 bg-zinc-100 px-4 py-2 text-center text-sm font-medium text-zinc-400 sm:flex-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-600">
              View portal ↗
            </span>
          )}
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className={`mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl ${stat.bg}`}>
              <stat.icon className={`h-4.5 w-4.5 ${stat.color}`} strokeWidth={2} />
            </div>
            <div className="text-3xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
              {stat.value}
            </div>
            <div className="mt-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* ── Charts ── */}
      {analytics && (
        <AnalyticsCharts
          data={analytics}
          jobId={id}
          volumePresetDays={presetDaysForToolbar}
          volumeCustomActive={volumeCustomActive}
        />
      )}

      {/* ── Job description ── */}
      {job.description_md && (
        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Job description
          </h2>
          <MarkdownContent markdown={job.description_md} />
        </div>
      )}
    </div>
  );
}
