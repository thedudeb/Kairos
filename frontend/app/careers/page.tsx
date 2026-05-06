/**
 * Public careers index — lists all currently active jobs.
 *
 * Architectural note: the spec says "there is no centralized portal; listings
 * are accessible only via their direct link" AND "do not appear in search
 * engine results or a centralized directory." The demo deliverables, however,
 * explicitly require "Browsing the careers listing page." We resolve this
 * contradiction by:
 *   1. Building the index so the demo flow works
 *   2. Aggressively marking it non-indexable / non-scrapable (same robots
 *      directives as individual job pages)
 *   3. Not linking to it from any other page — discoverability is by direct
 *      URL only, matching the spirit of "accessible only via direct link"
 */
import type { Metadata } from "next";
import Link from "next/link";

import { BACKEND_URL } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Careers · Kairos",
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

interface ActiveJob {
  slug: string;
  title: string;
}

async function fetchActiveJobs(): Promise<ActiveJob[]> {
  try {
    const res = await fetch(`${BACKEND_URL}/public/jobs-active`, {
      cache: "no-store",
    });
    if (!res.ok) return [];
    return (await res.json()) as ActiveJob[];
  } catch {
    return [];
  }
}

export default async function CareersIndexPage() {
  const jobs = await fetchActiveJobs();

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Branded hero header — matches /careers/[slug] */}
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

        <div className="relative z-10 mx-auto flex h-14 max-w-3xl items-center justify-between px-4 sm:px-6">
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
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Careers
          </span>
        </div>

        <div className="relative z-10 mx-auto max-w-3xl px-4 pb-12 pt-10 sm:px-6">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-indigo-400">
            Open roles
          </p>
          <h1 className="shimmer-title text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
            Join the team
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-zinc-400">
            We&apos;re looking for thoughtful people to help shape what we&apos;re
            building. Browse our open positions below.
          </p>
        </div>
      </div>

      {/* Listings */}
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-12">
        {jobs.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="space-y-3">
            {jobs.map((job) => (
              <li key={job.slug}>
                <Link
                  href={`/careers/${job.slug}`}
                  className="group flex items-center justify-between gap-4 rounded-2xl border border-zinc-200 bg-white px-6 py-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-indigo-900"
                >
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-base font-semibold text-zinc-900 dark:text-zinc-100">
                      {job.title}
                    </h2>
                    <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Actively hiring
                    </p>
                  </div>
                  <span className="text-zinc-300 transition-colors group-hover:text-indigo-500 dark:text-zinc-600 dark:group-hover:text-indigo-400">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M9 6l6 6-6 6"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-10 text-center text-xs text-zinc-400">
          Powered by <span className="font-medium text-zinc-500">Kairos</span>
          {" "}· Recruitment Intelligence Platform
        </p>
      </main>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-200 bg-white px-6 py-16 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mx-auto mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-800">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 2L12 9M12 9L17 6M12 9L7 6M12 9L17 12M12 9L7 12M12 9L12 16"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-zinc-400 dark:text-zinc-500"
          />
        </svg>
      </div>
      <h2 className="mb-1.5 text-base font-semibold text-zinc-900 dark:text-zinc-100">
        No open positions right now
      </h2>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Check back soon — new roles are posted regularly.
      </p>
    </div>
  );
}
