import { cn } from "@/lib/utils";
import type { RankStatus } from "@/types/api";
import { Loader2, Sparkles } from "lucide-react";

interface FitScoreBadgeProps {
  score: number | null | undefined;
  status?: RankStatus | null;
  size?: "sm" | "md";
  className?: string;
}

function tone(score: number): string {
  if (score >= 80) return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";
  if (score >= 60) return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
  return "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300";
}

export function FitScoreBadge({ score, status, size = "sm", className }: FitScoreBadgeProps) {
  const sizeCls =
    size === "md" ? "px-2.5 py-1 text-sm" : "px-1.5 py-0.5 text-xs";

  if (status === "ranking" || status === "pending") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-md bg-zinc-100 font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
          sizeCls,
          className,
        )}
        title="Scoring…"
      >
        <Loader2 className="h-3 w-3 animate-spin" />
        <span className="hidden sm:inline">Scoring</span>
      </span>
    );
  }

  if (score == null) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-md bg-zinc-50 font-medium text-zinc-400 dark:bg-zinc-800/50 dark:text-zinc-600",
          sizeCls,
          className,
        )}
        title={status === "failed" ? "Score failed" : "Not scored yet"}
      >
        —
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md font-semibold tabular-nums",
        tone(score),
        sizeCls,
        className,
      )}
      title={`AI fit score: ${score}/100`}
    >
      <Sparkles className="h-3 w-3 opacity-70" />
      {score}
    </span>
  );
}
