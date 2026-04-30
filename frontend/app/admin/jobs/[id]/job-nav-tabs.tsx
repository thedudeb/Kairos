"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
  const jobBase = `/admin/jobs/${jobId}`;

  return (
    <nav className="-mb-px flex flex-wrap gap-x-6 gap-y-2" aria-label="Job sections">
      {NAV_TABS.map((tab) => {
        const href = `${jobBase}${tab.href}`;
        const isActive =
          tab.href === ""
            ? pathname === jobBase
            : pathname === href || pathname.startsWith(`${href}/`);

        return (
          <Link
            key={tab.href || "overview"}
            href={href}
            className={cn(
              "relative z-10 border-b-2 py-2.5 text-sm font-medium transition-colors",
              isActive
                ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700 dark:hover:border-zinc-600 dark:hover:text-zinc-300",
            )}
            aria-current={isActive ? "page" : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
