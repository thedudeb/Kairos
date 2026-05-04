"use client";

import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Search, RefreshCw, Download, ChevronUp, ChevronDown, X, Filter, ChevronLeft, ChevronRight } from "lucide-react";
import type { ApplicantListItem, PipelineStage } from "@/types/api";
import { ParseStatusBadge } from "./parse-status-badge";
import { ApplicantAvatar } from "@/components/applicant-avatar";
import { FitScoreBadge } from "@/components/admin/fit-score-badge";
import { SEARCH_INPUT_ID } from "@/components/admin/admin-keyboard-shortcuts";
import { cn } from "@/lib/utils";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hours = Math.floor(diff / 3600000);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(diff / 86400000);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}yr ago`;
}

type GroupBy = "none" | "stage" | "institution" | "degree";

interface ApplicantTableProps {
  jobId: string;
  applicants: ApplicantListItem[];
  stages: PipelineStage[];
  availableSkills: string[];
  activeStageId: string | null;
  searchQuery: string;
  activeInstitution: string;
  activeDegree: string;
  activeDateFrom: string;
  activeDateTo: string;
  activeSkills: string[];
  sortBy: string;
  sortDir: string;
  page: number;
  pageSize: number;
  canExport?: boolean;
}

export function ApplicantTable({
  jobId,
  applicants,
  stages,
  availableSkills,
  activeStageId,
  searchQuery,
  activeInstitution,
  activeDegree,
  activeDateFrom,
  activeDateTo,
  activeSkills,
  sortBy,
  sortDir,
  page,
  pageSize,
  canExport = true,
}: ApplicantTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = useState(searchQuery);
  const [isPending, startTransition] = useTransition();
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [showFilters, setShowFilters] = useState(
    !!(activeInstitution || activeDegree || activeDateFrom || activeDateTo || activeSkills.length),
  );
  const [institution, setInstitution] = useState(activeInstitution);
  const [degree, setDegree] = useState(activeDegree);
  const [dateFrom, setDateFrom] = useState(activeDateFrom);
  const [dateTo, setDateTo] = useState(activeDateTo);

  const hasMore = applicants.length === pageSize;

  function buildParams(
    overrides: Record<string, string | string[] | null>,
    resetPage = false,
  ) {
    const sp = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(overrides)) {
      sp.delete(k);
      if (v === null) continue;
      if (Array.isArray(v)) {
        for (const item of v) sp.append(k, item);
      } else if (v) {
        sp.set(k, v);
      }
    }
    if (resetPage) sp.delete("page");
    return sp.toString();
  }

  function applyFilter(key: string, value: string | null) {
    startTransition(() =>
      router.push(`${pathname}?${buildParams({ [key]: value }, true)}`),
    );
  }

  function toggleSkill(skill: string) {
    const next = activeSkills.includes(skill)
      ? activeSkills.filter((s) => s !== skill)
      : [...activeSkills, skill];
    startTransition(() =>
      router.push(
        `${pathname}?${buildParams({ skills: next.length ? next : null }, true)}`,
      ),
    );
  }

  function toggleSort(col: string) {
    const newDir = sortBy === col && sortDir === "desc" ? "asc" : "desc";
    startTransition(() =>
      router.push(
        `${pathname}?${buildParams({ sort_by: col, sort_dir: newDir }, true)}`,
      ),
    );
  }

  function goToPage(p: number) {
    startTransition(() =>
      router.push(`${pathname}?${buildParams({ page: p > 1 ? String(p) : null })}`),
    );
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    applyFilter("search", search || null);
  }

  function applyAdvancedFilters() {
    startTransition(() =>
      router.push(
        `${pathname}?${buildParams(
          {
            institution: institution || null,
            degree: degree || null,
            date_from: dateFrom || null,
            date_to: dateTo || null,
          },
          true,
        )}`,
      ),
    );
  }

  function clearAllFilters() {
    setSearch("");
    setInstitution("");
    setDegree("");
    setDateFrom("");
    setDateTo("");
    startTransition(() =>
      router.push(
        `${pathname}?${buildParams(
          {
            stage_id: null,
            search: null,
            institution: null,
            degree: null,
            date_from: null,
            date_to: null,
            skills: null,
            page: null,
          },
          false,
        )}`,
      ),
    );
  }

  const hasActiveFilters =
    activeStageId || searchQuery || activeInstitution || activeDegree ||
    activeDateFrom || activeDateTo || activeSkills.length;

  return (
    <div>
      {/* Search + toolbar row */}
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
        <form onSubmit={handleSearchSubmit} className="relative w-full sm:max-w-sm sm:flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            id={SEARCH_INPUT_ID}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, institution…"
            className="w-full rounded-lg border border-zinc-200 bg-white py-2 pl-9 pr-4 text-sm outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </form>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
              showFilters
                ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
            )}
          >
            <Filter className="h-3.5 w-3.5" />
            Filters
            {hasActiveFilters ? (
              <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-indigo-500" />
            ) : null}
          </button>

          <div className="ml-auto flex items-center gap-2 sm:ml-0">
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as GroupBy)}
              className="rounded-lg border border-zinc-200 bg-white py-2 pl-3 pr-8 text-sm text-zinc-700 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
            >
              <option value="none">No grouping</option>
              <option value="stage">Group by stage</option>
              <option value="institution">Group by institution</option>
              <option value="degree">Group by degree</option>
            </select>

            {canExport && (
            <a
              href={`/api/jobs/${jobId}/export`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Export CSV</span>
            </a>
            )}

            {isPending && <RefreshCw className="h-4 w-4 animate-spin text-zinc-400" />}
          </div>
        </div>
      </div>

      {/* Stage filter pills */}
      <div className="mb-3 flex flex-wrap gap-2">
        <button
          onClick={() => applyFilter("stage_id", null)}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium transition-colors",
            !activeStageId
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
              : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300",
          )}
        >
          All ({applicants.length})
        </button>
        {stages.map((stage) => {
          const count = applicants.filter((a) => a.current_stage_id === stage.id).length;
          return (
            <button
              key={stage.id}
              onClick={() => applyFilter("stage_id", activeStageId === stage.id ? null : stage.id)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                activeStageId === stage.id
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300",
              )}
            >
              {stage.name} ({count})
            </button>
          );
        })}
      </div>

      {/* Advanced filters panel */}
      {showFilters && (
        <div className="mb-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-500">Institution</label>
              <input
                type="text"
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
                placeholder="Filter by institution…"
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-500">Degree / Field</label>
              <input
                type="text"
                value={degree}
                onChange={(e) => setDegree(e.target.value)}
                placeholder="Filter by degree…"
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-500">Applied from</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-500">Applied to</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
          </div>

          {availableSkills.length > 0 && (
            <div className="mt-3">
              <label className="mb-1.5 block text-xs font-medium text-zinc-500">Skills</label>
              <div className="flex flex-wrap gap-1.5">
                {availableSkills.map((skill) => (
                  <button
                    key={skill}
                    onClick={() => toggleSkill(skill)}
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
                      activeSkills.includes(skill)
                        ? "bg-blue-600 text-white"
                        : "bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
                    )}
                  >
                    {skill}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={applyAdvancedFilters}
              className="rounded-lg bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
            >
              Apply
            </button>
            {hasActiveFilters && (
              <button
                onClick={clearAllFilters}
                className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600"
              >
                <X className="h-3 w-3" />
                Clear all
              </button>
            )}
          </div>
        </div>
      )}

      {/* Table */}
      {applicants.length === 0 && page === 1 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-200 py-20 text-center dark:border-zinc-800">
          <p className="text-sm font-medium text-zinc-500">No applicants match these filters</p>
          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="mt-2 text-xs text-zinc-400 hover:text-zinc-600 underline"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <ApplicantTableBody
          applicants={applicants}
          jobId={jobId}
          groupBy={groupBy}
          sortBy={sortBy}
          sortDir={sortDir}
          onSort={toggleSort}
        />
      )}

      {/* Pagination */}
      {(page > 1 || hasMore) && (
        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={() => goToPage(page - 1)}
            disabled={page <= 1 || isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </button>
          <span className="text-sm text-zinc-500">
            Page {page}
            {!hasMore && applicants.length === 0 ? " (no results)" : ""}
          </span>
          <button
            onClick={() => goToPage(page + 1)}
            disabled={!hasMore || isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SortIcon({ col, sortBy, sortDir }: { col: string; sortBy: string; sortDir: string }) {
  if (sortBy !== col) return <span className="ml-1 opacity-30">↕</span>;
  return sortDir === "asc" ? (
    <ChevronUp className="ml-1 inline h-3 w-3" />
  ) : (
    <ChevronDown className="ml-1 inline h-3 w-3" />
  );
}

function ApplicantRow({ a, jobId }: { a: ApplicantListItem; jobId: string }) {
  return (
    <tr className="group transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
      {/* Person */}
      <td className="px-4 py-3">
        <Link
          href={`/admin/jobs/${jobId}/applicants/${a.id}`}
          className="flex items-center gap-3"
        >
          <ApplicantAvatar firstName={a.first_name} lastName={a.last_name} size="sm" />
          <div className="min-w-0">
            <p className="font-medium text-zinc-900 group-hover:text-indigo-600 dark:text-zinc-100 dark:group-hover:text-indigo-400 transition-colors">
              {a.first_name} {a.last_name}
            </p>
            <p className="truncate text-xs text-zinc-400">{a.email}</p>
          </div>
        </Link>
      </td>

      {/* Education */}
      <td className="hidden px-4 py-3 md:table-cell">
        {a.top_institution ? (
          <div className="min-w-0">
            <p className="truncate text-sm text-zinc-700 dark:text-zinc-300">{a.top_institution}</p>
            {a.top_degree && (
              <p className="truncate text-xs text-zinc-400">{a.top_degree}</p>
            )}
          </div>
        ) : (
          <span className="text-zinc-300 dark:text-zinc-600">—</span>
        )}
      </td>

      {/* Stage */}
      <td className="hidden px-4 py-3 lg:table-cell">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500" />
          {a.current_stage_name}
        </span>
      </td>

      {/* Parse */}
      <td className="hidden px-4 py-3 lg:table-cell">
        <ParseStatusBadge status={a.parse_status} />
      </td>

      {/* Fit score */}
      <td className="px-4 py-3">
        <FitScoreBadge score={a.fit_score} status={a.fit_status} />
      </td>

      {/* Applied */}
      <td className="px-4 py-3 text-xs text-zinc-400 tabular-nums">
        {timeAgo(a.submitted_at)}
      </td>
    </tr>
  );
}

function ApplicantTableBody({
  applicants,
  jobId,
  groupBy,
  sortBy,
  sortDir,
  onSort,
}: {
  applicants: ApplicantListItem[];
  jobId: string;
  groupBy: GroupBy;
  sortBy: string;
  sortDir: string;
  onSort: (col: string) => void;
}) {
  const headers = (
    <tr className="border-b border-zinc-200 dark:border-zinc-800">
      <th
        className="cursor-pointer px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
        onClick={() => onSort("last_name")}
      >
        Applicant <SortIcon col="last_name" sortBy={sortBy} sortDir={sortDir} />
      </th>
      <th
        className="hidden cursor-pointer px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 md:table-cell"
        onClick={() => onSort("top_institution")}
      >
        Education <SortIcon col="top_institution" sortBy={sortBy} sortDir={sortDir} />
      </th>
      <th
        className="hidden cursor-pointer px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 lg:table-cell"
        onClick={() => onSort("current_stage_id")}
      >
        Stage <SortIcon col="current_stage_id" sortBy={sortBy} sortDir={sortDir} />
      </th>
      <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 lg:table-cell">
        Parse
      </th>
      <th
        className="cursor-pointer px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
        onClick={() => onSort("fit_score")}
      >
        Fit <SortIcon col="fit_score" sortBy={sortBy} sortDir={sortDir} />
      </th>
      <th
        className="cursor-pointer px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
        onClick={() => onSort("submitted_at")}
      >
        Applied <SortIcon col="submitted_at" sortBy={sortBy} sortDir={sortDir} />
      </th>
    </tr>
  );

  if (groupBy === "none") {
    return (
      <div className="overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-900/60">{headers}</thead>
          <tbody className="divide-y divide-zinc-100 bg-white dark:divide-zinc-800 dark:bg-zinc-900">
            {applicants.map((a) => (
              <ApplicantRow key={a.id} a={a} jobId={jobId} />
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const groupKey = (a: ApplicantListItem) => {
    if (groupBy === "stage") return a.current_stage_name;
    if (groupBy === "institution") return a.top_institution ?? "Unknown institution";
    if (groupBy === "degree") return a.top_degree ?? "Unknown degree";
    return "";
  };

  const groups = new Map<string, ApplicantListItem[]>();
  for (const a of applicants) {
    const key = groupKey(a);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(a);
  }

  return (
    <div className="space-y-4">
      {[...groups.entries()].map(([group, members]) => (
        <div key={group} className="overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800">
          <div className="border-b border-zinc-100 bg-zinc-50 px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-900">
            <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">{group}</span>
            <span className="ml-2 text-xs text-zinc-400">{members.length}</span>
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-zinc-100 bg-white dark:divide-zinc-800 dark:bg-zinc-900">
              {members.map((a) => (
                <ApplicantRow key={a.id} a={a} jobId={jobId} />
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
