"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import type { ParseStatus } from "@/types/api";
import { reparseResume } from "../actions";

interface ReparseButtonProps {
  jobId: string;
  applicantId: string;
  parseStatus: ParseStatus;
}

export function ReparseButton({
  jobId,
  applicantId,
  parseStatus,
}: ReparseButtonProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const canReparse = parseStatus === "failed" || parseStatus === "parsed" || parseStatus === "needs_manual";
  if (!canReparse) return null;

  function handleClick() {
    startTransition(async () => {
      await reparseResume(jobId, applicantId);
      router.refresh();
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
    >
      <RefreshCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
      Re-parse
    </button>
  );
}
