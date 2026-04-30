import { Skeleton, CardSkeleton } from "@/components/ui/skeleton";

export default function ApplicantDetailLoading() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto max-w-6xl">
          <Skeleton className="mb-3 h-4 w-32" />
          <div className="flex justify-between">
            <div>
              <Skeleton className="mb-2 h-7 w-48" />
              <Skeleton className="h-4 w-80" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-9 w-20 rounded-full" />
              <Skeleton className="h-9 w-28 rounded-lg" />
            </div>
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
              <Skeleton className="mb-4 h-5 w-40" />
              <div className="grid gap-3 sm:grid-cols-3">
                {[1, 2, 3].map((i) => (
                  <div key={i}><Skeleton className="mb-1 h-3 w-16" /><Skeleton className="h-5 w-32" /></div>
                ))}
              </div>
              <div className="mt-5 space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-4 w-full" />)}
              </div>
            </div>
          </div>
          <div className="space-y-6">
            <CardSkeleton />
            <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
              <Skeleton className="mb-3 h-4 w-24" />
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
