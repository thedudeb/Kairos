"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Check, X, Loader2 } from "lucide-react";
import { KanbanBoard } from "./kanban-board";
import type { ApplicantListItem } from "@/types/api";

interface Stage {
  id: string;
  name: string;
  sort_order: number;
  is_terminal: boolean;
  applicant_count: number;
}

interface PipelineShellProps {
  jobId: string;
  stages: Stage[];
  byStage: Record<string, ApplicantListItem[]>;
}

export function PipelineShell({ jobId, stages, byStage }: PipelineShellProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function openAdd() {
    setNewName("");
    setError(null);
    setShowAddForm(true);
  }

  function cancelAdd() {
    setShowAddForm(false);
    setNewName("");
    setError(null);
  }

  function addStage() {
    if (!newName.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/pipeline/${jobId}/stages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newName.trim(), is_terminal: false }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { detail?: string }).detail ?? "Failed to add stage");
        }
        setShowAddForm(false);
        setNewName("");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to add stage");
      }
    });
  }

  // key forces KanbanBoard to remount when stages change (e.g. after add/delete/reorder)
  const boardKey = stages.map((s) => `${s.id}:${s.sort_order}`).join(",");

  return (
    <div className="flex h-[calc(100dvh-8rem)] flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-4 py-2 dark:border-zinc-800 dark:bg-zinc-950">
        <p className="hidden text-xs text-zinc-400 sm:block">
          Drag cards between columns · Drag column headers to reorder
        </p>

        <div className="flex items-center gap-2">
          {error && (
            <span className="text-xs text-red-500">{error}</span>
          )}
          {showAddForm ? (
            <div className="flex items-center gap-1.5">
              <input
                autoFocus
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addStage();
                  if (e.key === "Escape") cancelAdd();
                }}
                placeholder="Stage name…"
                className="h-8 w-32 rounded-md border border-zinc-200 bg-white px-2.5 text-sm outline-none focus:border-indigo-400 sm:w-44 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
              <button
                onClick={addStage}
                disabled={isPending || !newName.trim()}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-zinc-900 text-white disabled:opacity-40 hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                onClick={cancelAdd}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-200 text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={openAdd}
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <Plus className="h-4 w-4" />
              Add stage
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <KanbanBoard
          key={boardKey}
          jobId={jobId}
          stages={stages}
          initialByStage={byStage}
        />
      </div>
    </div>
  );
}
