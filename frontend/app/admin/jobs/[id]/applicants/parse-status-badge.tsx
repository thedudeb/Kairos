import type { ParseStatus } from "@/types/api";
import { cn } from "@/lib/utils";

const CONFIG: Record<ParseStatus, { label: string; classes: string }> = {
  pending: {
    label: "Pending",
    classes: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
  },
  parsing: {
    label: "Parsing…",
    classes: "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400",
  },
  parsed: {
    label: "Parsed",
    classes:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400",
  },
  failed: {
    label: "Failed",
    classes: "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400",
  },
  needs_manual: {
    label: "Review",
    classes:
      "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400",
  },
};

export function ParseStatusBadge({ status }: { status: ParseStatus }) {
  const { label, classes } = CONFIG[status] ?? CONFIG.pending;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        classes,
      )}
    >
      {status === "parsing" && (
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />
      )}
      {label}
    </span>
  );
}
