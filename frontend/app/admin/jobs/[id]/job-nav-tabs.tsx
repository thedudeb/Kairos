"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition, useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_TABS = [
  { href: "", label: "Overview" },
  { href: "/applicants", label: "Applicants" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/settings", label: "Settings" },
  { href: "/integrations", label: "Integrations" },
];

function normalizePath(p: string): string {
  if (p.length > 1 && p.endsWith("/")) return p.slice(0, -1);
  return p;
}

export function JobNavTabs({ jobId }: { jobId: string }) {
  const pathname = normalizePath(usePathname());
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // The tab the user just clicked — shown as active immediately so the click
  // feels instant, even if the new page is still fetching server-side data.
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const jobBase = `/admin/jobs/${jobId}`;

  function navigate(href: string) {
    if (href === pathname) return;
    setPendingHref(href);
    startTransition(() => {
      router.push(href);
    });
  }

  // Clear pending state once the transition resolves
  useEffect(() => {
    if (!isPending) setPendingHref(null);
  }, [isPending]);

  return (
    <nav
      className="-mb-px flex gap-x-6 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      aria-label="Job sections"
    >
      {NAV_TABS.map((tab) => {
        const href = `${jobBase}${tab.href}`;
        const realActive =
          tab.href === ""
            ? pathname === jobBase
            : pathname === href || pathname.startsWith(`${href}/`);
        // Optimistic active: if a click is in flight to this tab, show it as active.
        const optimisticActive = pendingHref ? pendingHref === href : realActive;
        const isLoading = isPending && pendingHref === href;

        return (
          <button
            key={tab.href || "overview"}
            type="button"
            onClick={() => navigate(href)}
            onMouseEnter={() => router.prefetch(href)}
            onFocus={() => router.prefetch(href)}
            className={cn(
              "relative z-10 inline-flex items-center gap-1.5 border-b-2 py-2.5 text-sm font-medium transition-colors",
              optimisticActive
                ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700 dark:hover:border-zinc-600 dark:hover:text-zinc-300",
            )}
            aria-current={realActive ? "page" : undefined}
          >
            {tab.label}
            {isLoading && <Loader2 className="h-3 w-3 animate-spin opacity-70" />}
          </button>
        );
      })}
    </nav>
  );
}
