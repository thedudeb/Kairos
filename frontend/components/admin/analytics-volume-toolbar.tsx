"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarRange } from "lucide-react";
import { cn } from "@/lib/utils";

const PRESETS = [7, 30, 90] as const;

const dateInputCls =
  "rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm tabular-nums text-zinc-900 shadow-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100";

/** Today's date YYYY-MM-DD in local timezone (matches `<input type="date">`). */
function todayIsoLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function AnalyticsVolumeToolbar({
  jobId,
  volumeRangeStart,
  volumeRangeEnd,
  presetDaysActive,
  presetDaysValue,
}: {
  jobId: string;
  volumeRangeStart: string;
  volumeRangeEnd: string;
  presetDaysActive: boolean;
  presetDaysValue: number;
}) {
  const router = useRouter();
  const maxDate = useMemo(() => todayIsoLocal(), []);
  const [from, setFrom] = useState(volumeRangeStart);
  const [to, setTo] = useState(volumeRangeEnd);

  function applyCustom(e: React.FormEvent) {
    e.preventDefault();
    if (!from || !to || from > to) return;
    router.push(`/admin/jobs/${jobId}?volume_from=${from}&volume_to=${to}`);
  }

  return (
    <div className="mb-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Presets</span>
        {PRESETS.map((d) => (
          <Link
            key={d}
            href={`/admin/jobs/${jobId}?volume_days=${d}`}
            scroll={false}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              presetDaysActive && presetDaysValue === d
                ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700",
            )}
          >
            Last {d} days
          </Link>
        ))}
      </div>

      <form
        onSubmit={applyCustom}
        className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-700 dark:bg-zinc-800/40 sm:flex-row sm:flex-wrap sm:items-end"
      >
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          <CalendarRange className="h-3.5 w-3.5" aria-hidden />
          Custom range
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">From</span>
          <input
            type="date"
            name="volume_from"
            value={from}
            max={to || maxDate}
            onChange={(e) => setFrom(e.target.value)}
            className={dateInputCls}
            required
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">To</span>
          <input
            type="date"
            name="volume_to"
            value={to}
            min={from}
            max={maxDate}
            onChange={(e) => setTo(e.target.value)}
            className={dateInputCls}
            required
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 sm:mb-0.5"
        >
          Apply range
        </button>
      </form>
    </div>
  );
}
