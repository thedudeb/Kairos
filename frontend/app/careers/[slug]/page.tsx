import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ApplicationForm } from "./application-form";

export const metadata: Metadata = {
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

import { BACKEND_URL } from "@/lib/constants";

interface JobData {
  id: string;
  title: string;
  slug: string;
  status: "active" | "closed" | "draft";
  description_md: string;
  description_kind: "markdown" | "external";
  description_external_url: string | null;
  description_summary: string | null;
  form_fields: Array<{
    id: string;
    label: string;
    field_type: string;
    is_required: boolean;
    options: string[] | null;
    sort_order: number;
    file_allowed_types?: string[] | null;
  }>;
}

async function fetchJob(slug: string): Promise<JobData | null | "closed"> {
  try {
    const res = await fetch(`${BACKEND_URL}/public/jobs/${slug}`, {
      cache: "no-store",
    });
    if (res.status === 404) return null;
    if (res.status === 410) return "closed";
    if (!res.ok) return null;
    const data: JobData = await res.json();
    if (data.status === "closed") return "closed";
    return data;
  } catch {
    return null;
  }
}

export default async function PublicJobPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const job = await fetchJob(slug);

  if (job === null) notFound();
  if (job === "closed") return <ClosedJobPage />;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">

      {/* Branded hero header */}
      <div className="relative overflow-hidden bg-[#0a0a0f]">

        {/* Gradient orbs */}
        <div className="pointer-events-none absolute inset-0">
          <div className="orb-primary absolute -top-20 left-1/2 h-[400px] w-[600px] -translate-x-1/2 rounded-full bg-indigo-600/20 blur-[100px]" />
          <div className="orb-secondary absolute -bottom-10 right-0 h-[250px] w-[300px] rounded-full bg-violet-600/15 blur-[80px]" />
        </div>

        {/* Grid overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)",
            backgroundSize: "72px 72px",
          }}
        />

        {/* Nav */}
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
          <span className="text-xs font-medium text-zinc-500 tracking-wide uppercase">Careers</span>
        </div>

        {/* Hero */}
        <div className="relative z-10 mx-auto max-w-3xl px-4 pb-12 pt-10 sm:px-6">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-indigo-400">
            Open position
          </p>
          <h1 className="shimmer-title text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
            {job.title}
          </h1>
          <div className="mt-4 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-400 ring-1 ring-emerald-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Actively hiring
            </span>
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-12">

        {/* Description */}
        {(job.description_kind === "external" && job.description_external_url) || job.description_md ? (
          <div className="mb-12">
            {job.description_kind === "external" && job.description_external_url ? (
              <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:px-8">
                {job.description_summary ? (
                  <div className="mb-5">
                    <MarkdownContent markdown={job.description_summary} />
                  </div>
                ) : null}
                <a
                  href={job.description_external_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  View full job description
                  <span className="text-xs opacity-80">↗</span>
                </a>
              </div>
            ) : job.description_md ? (
              <JobDescription markdown={job.description_md} />
            ) : null}
          </div>
        ) : null}

        {/* Application form card */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-8 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M8 1v7M8 8l4-3M8 8l-4-3M3 13h10" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Apply for this position
            </h2>
          </div>
          <ApplicationForm slug={slug} customFields={job.form_fields} />
        </div>

        {/* Footer */}
        <p className="mt-8 text-center text-xs text-zinc-400">
          Powered by{" "}
          <span className="font-medium text-zinc-500">Kairos</span>
          {" "}· Recruitment Intelligence Platform
        </p>
      </main>
    </div>
  );
}

function JobDescription({ markdown }: { markdown: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:px-8">
      <MarkdownContent markdown={markdown} />
    </div>
  );
}

function MarkdownContent({ markdown }: { markdown: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => (
          <h1 className="mt-6 mb-3 text-2xl font-bold text-zinc-900 dark:text-zinc-100">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="mt-6 mb-3 text-xl font-semibold text-zinc-900 dark:text-zinc-100">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="mt-5 mb-2 text-lg font-semibold text-zinc-800 dark:text-zinc-200">{children}</h3>
        ),
        p: ({ children }) => (
          <p className="mb-4 leading-relaxed text-zinc-700 dark:text-zinc-300">{children}</p>
        ),
        ul: ({ children }) => (
          <ul className="mb-4 ml-5 list-disc space-y-1 text-zinc-700 dark:text-zinc-300">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="mb-4 ml-5 list-decimal space-y-1 text-zinc-700 dark:text-zinc-300">{children}</ol>
        ),
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        strong: ({ children }) => (
          <strong className="font-semibold text-zinc-900 dark:text-zinc-100">{children}</strong>
        ),
        em: ({ children }) => <em className="italic">{children}</em>,
        code: ({ children }) => (
          <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-sm text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
            {children}
          </code>
        ),
        pre: ({ children }) => (
          <pre className="mb-4 overflow-x-auto rounded-lg bg-zinc-100 p-4 font-mono text-sm dark:bg-zinc-800">
            {children}
          </pre>
        ),
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-600 underline underline-offset-2 hover:text-indigo-700 dark:text-indigo-400"
          >
            {children}
          </a>
        ),
        blockquote: ({ children }) => (
          <blockquote className="mb-4 border-l-4 border-zinc-300 pl-4 italic text-zinc-600 dark:border-zinc-600 dark:text-zinc-400">
            {children}
          </blockquote>
        ),
        hr: () => <hr className="my-6 border-zinc-200 dark:border-zinc-700" />,
      }}
    >
      {markdown}
    </ReactMarkdown>
  );
}

function ClosedJobPage() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#0a0a0f] px-6 text-center">
      {/* Gradient orbs */}
      <div className="pointer-events-none absolute inset-0">
        <div className="orb-primary absolute -top-40 left-1/2 h-[400px] w-[400px] -translate-x-1/2 rounded-full bg-indigo-600/15 blur-[100px]" />
      </div>

      {/* Logo */}
      <div className="mb-8 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600">
          <svg width="14" height="14" viewBox="0 0 18 18" fill="none">
            <path d="M9 2L9 9M9 9L14 6M9 9L4 6M9 9L14 12M9 9L4 12M9 9L9 16" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <span className="text-sm font-semibold text-white">Kairos</span>
      </div>

      <div className="relative z-10 max-w-md">
        <div className="mb-5 inline-flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M12 2a5 5 0 0 1 5 5v3H7V7a5 5 0 0 1 5-5ZM7 10h10l1 12H6L7 10Z" stroke="rgba(139,120,255,0.8)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <h1 className="mb-3 text-2xl font-semibold text-white">
          Position closed
        </h1>
        <p className="text-zinc-400 leading-relaxed">
          This position is no longer accepting applications. Thank you for your
          interest.
        </p>
      </div>
    </div>
  );
}
