import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Open roles",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    noarchive: true,
    nosnippet: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
  other: {
    nollms: "noindex",
  },
};

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

interface ActiveJobRow {
  slug: string;
  title: string;
}

async function fetchActiveJobs(): Promise<ActiveJobRow[]> {
  try {
    const res = await fetch(`${BACKEND_URL}/public/jobs-active`, { cache: "no-store" });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export default async function CareersIndexPage() {
  const jobs = await fetchActiveJobs();

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto max-w-lg px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Open positions
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
          These listings are not publicly indexed — share direct links only. Active roles
          accepting applications appear below.
        </p>

        {jobs.length === 0 ? (
          <p className="mt-10 rounded-xl border border-dashed border-zinc-200 bg-white px-5 py-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
            No active openings right now.
          </p>
        ) : (
          <ul className="mt-10 space-y-2">
            {jobs.map((job) => (
              <li key={job.slug}>
                <Link
                  href={`/careers/${job.slug}`}
                  className="block rounded-xl border border-zinc-200 bg-white px-5 py-4 text-sm font-medium text-zinc-900 shadow-sm transition-colors hover:border-indigo-300 hover:bg-indigo-50/40 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-indigo-700 dark:hover:bg-indigo-950/30"
                >
                  {job.title}
                  <span className="mt-1 block font-mono text-xs font-normal text-zinc-400">
                    /careers/{job.slug}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
