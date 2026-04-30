"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  GripVertical, Plus, Pencil, Trash2, Check, X, Loader2,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";

interface Stage {
  id: string;
  name: string;
  sort_order: number;
  is_terminal: boolean;
  applicant_count: number;
}

async function apiCall(path: string, method: string, body?: object) {
  const res = await fetch(`/api/pipeline${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? "Request failed");
  }
  return res.status === 204 ? null : res.json();
}

interface StageManagerProps {
  jobId: string;
  initialStages: Stage[];
}

export function StageManager({ jobId, initialStages }: StageManagerProps) {
  const [stages, setStages] = useState(
    [...initialStages].sort((a, b) => a.sort_order - b.sort_order),
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [newName, setNewName] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  function startEdit(stage: Stage) {
    setEditingId(stage.id);
    setEditName(stage.name);
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
  }

  async function saveEdit(stage: Stage) {
    if (!editName.trim() || editName.trim() === stage.name) {
      cancelEdit();
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const updated = await apiCall(`/${jobId}/stages/${stage.id}`, "PUT", {
          name: editName.trim(),
        });
        setStages((prev) =>
          prev.map((s) => (s.id === stage.id ? { ...s, name: updated.name } : s)),
        );
        cancelEdit();
        router.refresh();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to rename stage");
      }
    });
  }

  async function deleteStage(stage: Stage) {
    if (stage.applicant_count > 0) {
      setError(
        `Cannot delete "${stage.name}" — ${stage.applicant_count} applicant(s) are currently in it.`,
      );
      return;
    }
    if (stages.length <= 1) {
      setError("Cannot delete the last pipeline stage.");
      return;
    }
    if (!confirm(`Delete stage "${stage.name}"? This cannot be undone.`)) return;
    setError(null);
    startTransition(async () => {
      try {
        await apiCall(`/${jobId}/stages/${stage.id}`, "DELETE");
        setStages((prev) => prev.filter((s) => s.id !== stage.id));
        router.refresh();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to delete stage");
      }
    });
  }

  async function addStage() {
    if (!newName.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        const created = await apiCall(`/${jobId}/stages`, "POST", {
          name: newName.trim(),
          is_terminal: false,
        });
        setStages((prev) => [...prev, created]);
        setNewName("");
        setShowAddForm(false);
        router.refresh();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to add stage");
      }
    });
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = stages.findIndex((s) => s.id === active.id);
    const newIdx = stages.findIndex((s) => s.id === over.id);
    const reordered = arrayMove(stages, oldIdx, newIdx).map((s, i) => ({
      ...s,
      sort_order: i,
    }));
    setStages(reordered);
    startTransition(async () => {
      try {
        await apiCall(`/${jobId}/stages`, "PUT",
          reordered.map((s) => ({ id: s.id, sort_order: s.sort_order })),
        );
        router.refresh();
      } catch {
        setStages(initialStages);
      }
    });
  }

  return (
    <div className="mx-auto max-w-lg p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          Pipeline stages
        </h2>
        <button
          onClick={() => { setShowAddForm((v) => !v); setError(null); }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
        >
          <Plus className="h-4 w-4" />
          Add stage
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {showAddForm && (
        <div className="mb-4 flex gap-2">
          <input
            autoFocus
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addStage(); if (e.key === "Escape") setShowAddForm(false); }}
            placeholder="Stage name…"
            className="flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
          <button
            onClick={addStage}
            disabled={isPending || !newName.trim()}
            className="rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          </button>
          <button
            onClick={() => setShowAddForm(false)}
            className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-500 dark:border-zinc-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={stages.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {stages.map((stage) => (
              <SortableStageRow
                key={stage.id}
                stage={stage}
                isEditing={editingId === stage.id}
                editName={editName}
                isPending={isPending}
                onEditName={setEditName}
                onStartEdit={() => startEdit(stage)}
                onSaveEdit={() => saveEdit(stage)}
                onCancelEdit={cancelEdit}
                onDelete={() => deleteStage(stage)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <p className="mt-4 text-xs text-zinc-400">
        Drag to reorder · Stages with applicants cannot be deleted
      </p>
    </div>
  );
}

function SortableStageRow({
  stage, isEditing, editName, isPending,
  onEditName, onStartEdit, onSaveEdit, onCancelEdit, onDelete,
}: {
  stage: Stage;
  isEditing: boolean;
  editName: string;
  isPending: boolean;
  onEditName: (v: string) => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: stage.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900",
        isDragging && "opacity-50 shadow-lg",
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab text-zinc-300 hover:text-zinc-400 active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {isEditing ? (
        <div className="flex flex-1 items-center gap-2">
          <input
            autoFocus
            value={editName}
            onChange={(e) => onEditName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onSaveEdit(); if (e.key === "Escape") onCancelEdit(); }}
            className="flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm outline-none focus:border-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          />
          <button onClick={onSaveEdit} disabled={isPending} className="text-emerald-600 hover:text-emerald-700">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          </button>
          <button onClick={onCancelEdit} className="text-zinc-400 hover:text-zinc-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <>
          <div className="flex-1">
            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              {stage.name}
            </span>
            {stage.is_terminal && (
              <span className="ml-2 rounded-full bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800">
                terminal
              </span>
            )}
          </div>
          <span className="text-xs text-zinc-400">
            {stage.applicant_count} applicant{stage.applicant_count !== 1 ? "s" : ""}
          </span>
          <button onClick={onStartEdit} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onDelete}
            disabled={isPending}
            className={cn(
              "text-zinc-400 hover:text-red-500 disabled:opacity-40",
              stage.applicant_count > 0 && "cursor-not-allowed opacity-30",
            )}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    </div>
  );
}
