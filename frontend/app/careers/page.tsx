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

      {/* Branded header — matches individual job pages */}
      <div className="relative overflow-hidden bg-[#0a0a0f]">
        <div className="pointer-events-none absolute inset-0">
          <div className="orb-primary absolute -top-20 left-1/2 h-[400px] w-[600px] -translate-x-1/2 rounded-full bg-indigo-600/20 blur-[100px]" />
          <div className="orb-secondary absolute -bottom-10 right-0 h-[250px] w-[300px] rounded-full bg-violet-600/15 blur-[80px]" />
        </div>
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)",
            backgroundSize: "72px 72px",
          }}
        />

        {/* Nav */}
        <div className="relative z-10 mx-auto flex h-14 max-w-3xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 shadow-md shadow-indigo-500/30">
              <svg width="14" height="14" viewBox="0 0 18 18" fill="none">
                <path
                  d="M9 2L9 9M9 9L14 6M9 9L4 6M9 9L14 12M9 9L4 12M9 9L9 16"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <span className="text-sm font-semibold tracking-tight text-white">Kairos</span>
          </div>
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Careers</span>
        </div>

        {/* Hero */}
        <div className="relative z-10 mx-auto max-w-3xl px-6 pb-12 pt-10">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-indigo-400">
            We&rsquo;re hiring
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Open positions
          </h1>
          <p className="mt-3 max-w-lg text-base leading-relaxed text-zinc-400">
            Browse our open roles below and apply directly. We review every application carefully.
          </p>
        </div>
      </div>

      {/* Job list */}
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        {jobs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-200 bg-white px-6 py-16 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              No open positions right now
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              Check back soon — we&rsquo;re growing.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {jobs.map((job) => (
              <li key={job.slug}>
                <Link
                  href={`/careers/${job.slug}`}
                  className="group flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-5 py-4 shadow-sm transition-all hover:border-indigo-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-indigo-700"
                >
                  <div>
                    <p className="font-medium text-zinc-900 transition-colors group-hover:text-indigo-600 dark:text-zinc-100 dark:group-hover:text-indigo-400">
                      {job.title}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-400">Full-time</p>
                  </div>
                  <svg
                    className="h-4 w-4 shrink-0 text-zinc-300 transition-transform group-hover:translate-x-0.5 group-hover:text-indigo-400 dark:text-zinc-600"
                    viewBox="0 0 16 16" fill="none"
                  >
                    <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-10 text-center text-xs text-zinc-400">
          Powered by <span className="font-medium text-zinc-500">Kairos</span> · Recruitment Intelligence Platform
        </p>
      </main>
    </div>
  );
}
