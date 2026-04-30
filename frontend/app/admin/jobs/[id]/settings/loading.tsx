import { Skeleton } from "@/components/ui/skeleton";

/** Narrow skeleton aligned with settings layout — avoids the overview chart placeholders from `[id]/loading.tsx`. */
export default function JobSettingsLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <Skeleton className="mb-6 h-6 w-36 rounded-md" />
      <div className="mb-4 flex gap-1 rounded-lg border border-zinc-200 bg-zinc-50 p-1 dark:border-zinc-800 dark:bg-zinc-900">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-9 flex-1 rounded-md" />
        ))}
      </div>
      <div className="space-y-5">
        <Skeleton className="h-10 w-full rounded-md" />
        <Skeleton className="h-10 w-full rounded-md" />
        <Skeleton className="h-48 w-full rounded-md" />
        <Skeleton className="h-10 w-28 rounded-md" />
      </div>
    </div>
  );
}
