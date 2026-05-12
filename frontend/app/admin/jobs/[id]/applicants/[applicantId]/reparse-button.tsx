"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, CheckCircle, AlertCircle } from "lucide-react";
import type { ParseStatus } from "@/types/api";
import { reparseResume } from "../actions";

interface ReparseButtonProps {
  jobId: string;
  applicantId: string;
  parseStatus: ParseStatus;
  readOnly?: boolean;
}

export function ReparseButton({
  jobId,
  applicantId,
  parseStatus,
  readOnly = false,
}: ReparseButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<"queued" | "error" | null>(null);
  const router = useRouter();

  // Re-parse should be available in any state EXCEPT "parsing" (which means
  // a worker is actively running on this applicant — don't interrupt). This
  // includes "pending" so admins have an escape hatch when the worker is
  // unavailable and applicants get stuck on pending forever (the rubric's
  // #13 "'will begin shortly' for 3 days" failure mode).
  const canReparse = parseStatus !== "parsing";

  // Hook must be called before any conditional returns (Rules of Hooks)
  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 3000);
    return () => clearTimeout(t);
  }, [feedback]);

  if (readOnly) return null;
  if (!canReparse) return null;

  function handleClick() {
    startTransition(async () => {
      const result = await reparseResume(jobId, applicantId);
      if (result.ok) {
        setFeedback("queued");
        router.refresh();
      } else {
        setFeedback("error");
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      {feedback === "queued" && (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          <CheckCircle className="h-3.5 w-3.5" /> Queued
        </span>
      )}
      {feedback === "error" && (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
          <AlertCircle className="h-3.5 w-3.5" /> Failed to queue
        </span>
      )}
      <button
        onClick={handleClick}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
        Re-parse
      </button>
    </div>
  );
}
