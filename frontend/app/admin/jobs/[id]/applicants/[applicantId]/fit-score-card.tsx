"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, RefreshCw, Loader2 } from "lucide-react";
import type { FitScoreOut } from "@/types/api";
import { cn } from "@/lib/utils";
import { rerankApplicant } from "../actions";

interface FitScoreCardProps {
  jobId: string;
  applicantId: string;
  fit: FitScoreOut | null;
  isAdmin: boolean;
}

function tone(score: number): string {
  if (score >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 60) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

function bgTone(score: number): string {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 60) return "bg-amber-500";
  return "bg-rose-500";
}

function Bar({ label, value }: { label: string; value: number | null | undefined }) {
  if (value == null) return null;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
        <span className="tabular-nums font-medium text-zinc-700 dark:text-zinc-300">{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div
          className={cn("h-full rounded-full transition-all", bgTone(value))}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

export function FitScoreCard({ jobId, applicantId, fit, isAdmin }: FitScoreCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [polling, setPolling] = useState(false);

  async function handleRerank() {
    startTransition(async () => {
      setPolling(true);
      await rerankApplicant(jobId, applicantId);
      // Refresh after a beat — Gemini call typically takes 2-4s
      setTimeout(() => {
        router.refresh();
        setPolling(false);
      }, 4000);
    });
  }

  const status = fit?.status;
  const score = fit?.fit_score ?? null;
  const isWorking = polling || status === "ranking" || status === "pending";

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          <Sparkles className="h-3.5 w-3.5" />
          AI fit score
        </h2>
        {isAdmin && (
          <button
            type="button"
            onClick={handleRerank}
            disabled={isPending || isWorking}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <RefreshCw className={cn("h-3 w-3", isWorking && "animate-spin")} />
            Rerank
          </button>
        )}
      </div>

      {isWorking ? (
        <div className="flex items-center gap-2 py-3 text-sm text-zinc-500 dark:text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Scoring against the job description…
        </div>
      ) : status === "skipped" ? (
        <p className="py-2 text-xs text-zinc-500 dark:text-zinc-400">
          {fit?.error || "Not scored — Gemini unavailable or job description missing."}
        </p>
      ) : status === "failed" ? (
        <p className="py-2 text-xs text-rose-500">
          Scoring failed. {fit?.error}
        </p>
      ) : score == null ? (
        <p className="py-2 text-xs text-zinc-500 dark:text-zinc-400">
          Not scored yet. {isAdmin && "Click Rerank to score now."}
        </p>
      ) : (
        <>
          <div className="mb-4 flex items-baseline gap-2">
            <span className={cn("text-4xl font-bold tabular-nums", tone(score))}>
              {score}
            </span>
            <span className="text-sm text-zinc-400">/ 100</span>
          </div>

          <div className="mb-4 space-y-2.5">
            <Bar label="Skills match" value={fit?.skills_match} />
            <Bar label="Experience" value={fit?.experience_match} />
            <Bar label="Trajectory" value={fit?.trajectory} />
          </div>

          {fit?.reasoning && (
            <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
              {fit.reasoning}
            </p>
          )}
          {fit?.model && (
            <p className="mt-3 text-[10px] text-zinc-400 dark:text-zinc-600">
              {fit.model}
            </p>
          )}
        </>
      )}
    </section>
  );
}
