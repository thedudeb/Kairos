import { Skeleton } from "@/components/ui/skeleton";

export default function PipelineLoading() {
  return (
    <div className="flex h-[calc(100dvh-12rem)] flex-col overflow-hidden md:h-[calc(100dvh-9rem)]">
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-4 py-2 dark:border-zinc-800 dark:bg-zinc-950">
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-8 w-28 rounded-md" />
      </div>
      <div className="flex flex-1 gap-4 overflow-x-auto p-6 pb-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex w-72 shrink-0 flex-col">
            <div className="mb-3 flex items-center gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-6 rounded-full" />
            </div>
            <div className="flex flex-1 flex-col gap-2 rounded-xl bg-zinc-100 p-2 dark:bg-zinc-900">
              {Array.from({ length: 3 }).map((__, j) => (
                <Skeleton key={j} className="h-20 w-full rounded-lg" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
