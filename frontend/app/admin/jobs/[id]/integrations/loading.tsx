import { Skeleton } from "@/components/ui/skeleton";

/** Matches centered integrations column — avoids overview chart skeleton during tab switches. */
export default function JobIntegrationsLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-6 w-56 rounded-md" />
            <Skeleton className="h-4 w-full max-w-md rounded-md" />
          </div>
          <Skeleton className="h-10 w-40 shrink-0 rounded-lg" />
        </div>
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    </div>
  );
}
