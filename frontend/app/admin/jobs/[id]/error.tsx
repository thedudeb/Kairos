"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, RefreshCw } from "lucide-react";

export default function JobWorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error("[job workspace error boundary]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-900/20">
          <AlertTriangle className="h-6 w-6 text-red-500" />
        </div>
        <h2 className="mb-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Failed to load job workspace
        </h2>
        <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
          {error.message || "An unexpected error occurred. You can try again or return to the dashboard."}
        </p>
        <div className="flex justify-center gap-3">
          <button
            onClick={() => router.push("/admin")}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </button>
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}
