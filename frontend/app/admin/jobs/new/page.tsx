"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createJob } from "@/app/admin/actions";

export default function NewJobPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [slugOverride, setSlugOverride] = useState("");
  const [description, setDescription] = useState("");

  const suggestedSlug = title
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createJob({
        title: title.trim(),
        slug: slugOverride || undefined,
        description_md: description,
      });
      if (result.ok) {
        router.push(`/admin/jobs/${result.id}/settings`);
      } else {
        setError(result.error);
      }
    });
  }

  const inputBase =
    "block w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-500";

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10">
      <div className="mb-8">
        <Link
          href="/admin"
          className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          ← Back to jobs
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Create a job</h1>
        <p className="mt-1 text-sm text-zinc-500">
          You can add custom form fields and a template after creating the job.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Title */}
        <div>
          <label className="mb-1.5 block text-sm font-medium">Job title</label>
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Full Stack Engineer"
            className={inputBase}
          />
        </div>

        {/* Slug */}
        <div>
          <label className="mb-1.5 block text-sm font-medium">
            URL slug{" "}
            <span className="font-normal text-zinc-400">(auto-generated from title)</span>
          </label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-zinc-400">/careers/</span>
            <input
              value={slugOverride}
              onChange={(e) => setSlugOverride(e.target.value)}
              placeholder={suggestedSlug || "my-job"}
              className={`${inputBase} flex-1`}
            />
          </div>
          {suggestedSlug && !slugOverride && (
            <p className="mt-1 text-xs text-zinc-400">
              Will be saved as <code className="font-mono">{suggestedSlug}</code>
            </p>
          )}
        </div>

        {/* Description */}
        <div>
          <label className="mb-1.5 block text-sm font-medium">
            Job description{" "}
            <span className="font-normal text-zinc-400">(Markdown supported)</span>
          </label>
          <textarea
            rows={8}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the role, responsibilities, requirements…"
            className={inputBase}
          />
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={isPending || !title.trim()}
            className="rounded-md bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {isPending ? "Creating…" : "Create job"}
          </button>
          <Link href="/admin" className="text-sm text-zinc-500 hover:text-zinc-700">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
