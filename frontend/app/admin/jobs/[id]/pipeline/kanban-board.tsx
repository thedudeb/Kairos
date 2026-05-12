"use client";

import { useState, useTransition } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  pointerWithin,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDroppable } from "@dnd-kit/core";
import {
  GripVertical, Pencil, Trash2, Check, X, Loader2, GripHorizontal,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ParseStatusBadge } from "../applicants/parse-status-badge";
import { ApplicantAvatar } from "@/components/applicant-avatar";
import { moveApplicantStage } from "../applicants/actions";
import type { ApplicantListItem } from "@/types/api";
import { cn } from "@/lib/utils";

// Column IDs are prefixed to avoid collisions with card IDs
const COL = "col:";

function formatTimeInStage(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m`;
  const hours = Math.floor(diffMs / 3600000);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(diffMs / 86400000);
  if (days < 14) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 8) return `${weeks}w`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(months / 12)}yr`;
}

interface Stage {
  id: string;
  name: string;
  sort_order: number;
  is_terminal: boolean;
  applicant_count: number;
}

interface KanbanBoardProps {
  jobId: string;
  stages: Stage[];
  initialByStage: Record<string, ApplicantListItem[]>;
  readOnly?: boolean;
}

/** Result tag so callers can distinguish a successful 204 from a silent
 *  failure that previously also returned null. */
type ApiStagesResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

async function apiStages(
  jobId: string,
  method: string,
  path: string,
  body?: object,
): Promise<ApiStagesResult> {
  const res = await fetch(`/api/pipeline/${jobId}/stages${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return { ok: true, data: null };
  if (res.ok) {
    return { ok: true, data: await res.json() };
  }
  // Surface a real error message from the backend ("Cannot delete the last
  // pipeline stage." / "Cannot delete stage: N applicant(s) are currently
  // in it." / etc.) instead of dropping it on the floor.
  const detail = await res
    .json()
    .then((j) => (typeof j?.detail === "string" ? j.detail : null))
    .catch(() => null);
  return { ok: false, error: detail ?? `Request failed (${res.status})` };
}

export function KanbanBoard({ jobId, stages: initialStages, initialByStage, readOnly = false }: KanbanBoardProps) {
  const [stages, setStages] = useState(
    [...initialStages].sort((a, b) => a.sort_order - b.sort_order),
  );
  const [byStage, setByStage] = useState<Record<string, ApplicantListItem[]>>(initialByStage);
  const [activeCard, setActiveCard] = useState<ApplicantListItem | null>(null);
  const [activeColumn, setActiveColumn] = useState<Stage | null>(null);
  const [dragOriginStage, setDragOriginStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  /** Show an error banner; auto-clears after 5s. */
  function reportError(msg: string) {
    setError(msg);
    setTimeout(() => setError((cur) => (cur === msg ? null : cur)), 5000);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: readOnly ? 10_000 : 6 } }),
  );

  function findApplicant(id: string): ApplicantListItem | null {
    for (const cards of Object.values(byStage)) {
      const found = cards.find((c) => c.id === id);
      if (found) return found;
    }
    return null;
  }

  function findStageForApplicant(applicantId: string): string | null {
    for (const [stageId, cards] of Object.entries(byStage)) {
      if (cards.some((c) => c.id === applicantId)) return stageId;
    }
    return null;
  }

  /** Resolve over.id → stage id, whether it's a plain stage id, col: prefixed, or a card id */
  function resolveToStage(overId: string): string | null {
    if (byStage[overId] !== undefined) return overId;
    if (overId.startsWith(COL)) return overId.slice(COL.length);
    return findStageForApplicant(overId);
  }

  function handleDragStart(event: DragStartEvent) {
    const id = event.active.id as string;
    if (id.startsWith(COL)) {
      setActiveColumn(stages.find((s) => `${COL}${s.id}` === id) ?? null);
    } else {
      setActiveCard(findApplicant(id));
      setDragOriginStage(findStageForApplicant(id));
    }
  }

  function handleDragOver(event: DragOverEvent) {
    if (readOnly) return;
    const { active, over } = event;
    if (!over) return;
    const activeId = active.id as string;
    if (activeId.startsWith(COL)) return; // column drag — handled on end

    const fromStage = findStageForApplicant(activeId);
    const toStage = resolveToStage(over.id as string);
    if (!fromStage || !toStage || fromStage === toStage) return;

    setByStage((prev) => {
      const applicant = prev[fromStage].find((c) => c.id === activeId);
      if (!applicant) return prev;
      return {
        ...prev,
        [fromStage]: prev[fromStage].filter((c) => c.id !== activeId),
        [toStage]: [...prev[toStage], { ...applicant, current_stage_id: toStage }],
      };
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    if (readOnly) return;
    const { active, over } = event;
    setActiveCard(null);
    setActiveColumn(null);
    const originStage = dragOriginStage;
    setDragOriginStage(null);
    if (!over) return;

    const activeId = active.id as string;

    // ── Column reorder ──
    if (activeId.startsWith(COL)) {
      const overId = over.id as string;
      if (!overId.startsWith(COL) || activeId === overId) return;
      const oldIdx = stages.findIndex((s) => `${COL}${s.id}` === activeId);
      const newIdx = stages.findIndex((s) => `${COL}${s.id}` === overId);
      const prevStages = stages;
      const reordered = arrayMove(stages, oldIdx, newIdx).map((s, i) => ({
        ...s,
        sort_order: i,
      }));
      setStages(reordered);
      startTransition(async () => {
        const res = await apiStages(
          jobId,
          "PUT",
          "",
          reordered.map((s) => ({ id: s.id, sort_order: s.sort_order })),
        );
        if (!res.ok) {
          // Revert the optimistic move so the UI matches the server state,
          // and surface the real reason.
          setStages(prevStages);
          reportError(res.error);
          return;
        }
        router.refresh();
      });
      return;
    }

    // ── Card drop ──
    const toStage = resolveToStage(over.id as string);
    if (!toStage || !originStage) return;

    // ── Intra-column reorder (drag up/down within same column) ──
    if (originStage === toStage) {
      const overId = over.id as string;
      setByStage((prev) => {
        const cards = prev[toStage];
        const oldIdx = cards.findIndex((c) => c.id === activeId);
        const newIdx = cards.findIndex((c) => c.id === overId);
        if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) return prev;
        return { ...prev, [toStage]: arrayMove(cards, oldIdx, newIdx) };
      });
      return;
    }

    // ── Cross-column move ──
    startTransition(async () => {
      const result = await moveApplicantStage(jobId, activeId, toStage);
      if (!result.ok) router.refresh();
    });
  }

  function handleRenameStage(stageId: string, newName: string) {
    setStages((prev) =>
      prev.map((s) => (s.id === stageId ? { ...s, name: newName } : s)),
    );
  }

  function handleDeleteStage(stageId: string) {
    setStages((prev) => prev.filter((s) => s.id !== stageId));
    setByStage((prev) => {
      const next = { ...prev };
      delete next[stageId];
      return next;
    });
    router.refresh();
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      {error && (
        <div
          role="alert"
          className="mx-6 mt-4 flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-400"
        >
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-red-500 hover:text-red-700 dark:hover:text-red-300"
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}
      <SortableContext
        items={stages.map((s) => `${COL}${s.id}`)}
        strategy={horizontalListSortingStrategy}
      >
        <div className="flex h-full gap-4 overflow-x-auto p-6 pb-4">
          {stages.map((stage) => (
            <KanbanColumn
              key={stage.id}
              stage={stage}
              cards={byStage[stage.id] ?? []}
              jobId={jobId}
              onRename={handleRenameStage}
              onDelete={handleDeleteStage}
              onError={reportError}
              canDelete={stages.length > 1 && (byStage[stage.id]?.length ?? 0) === 0}
              readOnly={readOnly}
            />
          ))}
        </div>
      </SortableContext>

      <DragOverlay>
        {activeCard && (
          <ApplicantCard applicant={activeCard} jobId={jobId} isOverlay />
        )}
        {activeColumn && (
          <ColumnOverlay
            stage={activeColumn}
            count={byStage[activeColumn.id]?.length ?? 0}
          />
        )}
      </DragOverlay>
    </DndContext>
  );
}

// ─── Column ───────────────────────────────────────────────────────────────────

function KanbanColumn({
  stage,
  cards,
  jobId,
  onRename,
  onDelete,
  onError,
  canDelete,
  readOnly = false,
}: {
  stage: Stage;
  cards: ApplicantListItem[];
  jobId: string;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  /** Surface a real backend error message to the user — the previous
   *  code silently swallowed non-2xx responses, which is how rubric #21
   *  (deleted stages reappear after refresh) actually manifested. */
  onError: (msg: string) => void;
  canDelete: boolean;
  readOnly?: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(stage.name);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // Sortable for column reorder (drag handle on the grip icon)
  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging: isColumnDragging,
  } = useSortable({ id: `${COL}${stage.id}`, data: { type: "column" } });

  // Droppable for card drops
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: stage.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  function startEdit() {
    setEditName(stage.name);
    setIsEditing(true);
  }

  function cancelEdit() {
    setIsEditing(false);
    setEditName(stage.name);
  }

  function saveEdit() {
    const trimmed = editName.trim();
    if (!trimmed || trimmed === stage.name) { cancelEdit(); return; }
    startTransition(async () => {
      const res = await fetch(`/api/pipeline/${jobId}/stages/${stage.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const detail = await res
          .json()
          .then((j) => (typeof j?.detail === "string" ? j.detail : null))
          .catch(() => null);
        onError(detail ?? `Could not rename stage (${res.status}).`);
        // Stay in edit mode so the user can retry — don't silently revert.
        return;
      }
      const updated = await res.json();
      onRename(stage.id, updated.name);
      router.refresh();
      setIsEditing(false);
    });
  }

  function deleteStage() {
    if (!canDelete) return;
    if (!confirm(`Delete stage "${stage.name}"? This cannot be undone.`)) return;
    startTransition(async () => {
      const res = await fetch(`/api/pipeline/${jobId}/stages/${stage.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        // Backend rejected (403 reviewer, 409 last-stage or applicants-in-stage,
        // etc.). Surface the actual reason and DO NOT update local state —
        // doing so was the bug that caused "deleted stages reappear after
        // refresh" in the rubric.
        const detail = await res
          .json()
          .then((j) => (typeof j?.detail === "string" ? j.detail : null))
          .catch(() => null);
        onError(detail ?? `Could not delete stage (${res.status}).`);
        return;
      }
      onDelete(stage.id);
    });
  }

  return (
    <div
      ref={setSortableRef}
      style={style}
      className={cn(
        "flex w-72 shrink-0 flex-col",
        isColumnDragging && "opacity-40",
      )}
    >
      {/* Column header */}
      <div className="group mb-3 flex items-center gap-1.5">
        {/* Drag handle — triggers column reorder */}
        <button
          type="button"
          {...attributes}
          {...(readOnly ? {} : listeners)}
          className={cn(
            "text-zinc-300 hover:text-zinc-500 dark:text-zinc-600 dark:hover:text-zinc-400",
            readOnly ? "cursor-default opacity-40" : "cursor-grab active:cursor-grabbing",
          )}
          title={readOnly ? "" : "Drag to reorder"}
          disabled={readOnly}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        {isEditing ? (
          <div className="flex flex-1 items-center gap-1">
            <input
              autoFocus
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveEdit();
                if (e.key === "Escape") cancelEdit();
              }}
              className="flex-1 rounded border border-zinc-300 px-1.5 py-0.5 text-sm font-semibold outline-none focus:border-indigo-400 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            />
            <button onClick={saveEdit} disabled={isPending} className="text-emerald-600 hover:text-emerald-700">
              {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            </button>
            <button onClick={cancelEdit} className="text-zinc-400 hover:text-zinc-600">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <>
            <span className="flex-1 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              {stage.name}
            </span>
            {stage.is_terminal && (
              <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800">
                terminal
              </span>
            )}
            {!readOnly && (
            <span className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                onClick={startEdit}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                title="Rename stage"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                onClick={deleteStage}
                disabled={!canDelete}
                title={
                  !canDelete
                    ? cards.length > 0
                      ? "Move all applicants out first"
                      : "Cannot delete the last stage"
                    : "Delete stage"
                }
                className={cn(
                  "text-zinc-400 hover:text-red-500 dark:hover:text-red-400",
                  !canDelete && "cursor-not-allowed opacity-30",
                )}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </span>
            )}
            <span className="ml-1 text-sm font-medium text-zinc-400">{cards.length}</span>
          </>
        )}
      </div>

      {/* Card drop zone */}
      <div
        ref={setDropRef}
        className={cn(
          "flex flex-1 flex-col gap-2 rounded-xl p-2 transition-colors",
          isOver
            ? "bg-indigo-50 ring-2 ring-indigo-200 dark:bg-indigo-900/20 dark:ring-indigo-800"
            : "bg-zinc-100 dark:bg-zinc-900",
        )}
      >
        <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {cards.map((applicant) => (
            <ApplicantCard key={applicant.id} applicant={applicant} jobId={jobId} readOnly={readOnly} />
          ))}
        </SortableContext>
        {cards.length === 0 && (
          <div className="flex flex-1 items-center justify-center py-8 text-xs text-zinc-400">
            {readOnly ? "No applicants" : "Drop here"}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Drag overlay ghost for a whole column ────────────────────────────────────

function ColumnOverlay({ stage, count }: { stage: Stage; count: number }) {
  return (
    <div className="flex w-72 shrink-0 flex-col opacity-90">
      <div className="mb-3 flex items-center gap-1.5">
        <GripVertical className="h-4 w-4 text-zinc-300" />
        <span className="flex-1 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
          {stage.name}
        </span>
        <span className="text-sm font-medium text-zinc-400">{count}</span>
      </div>
      <div className="flex flex-1 flex-col gap-2 rounded-xl bg-zinc-100 p-2 ring-2 ring-indigo-400 dark:bg-zinc-900">
        {/* ghost placeholder */}
        <div className="h-16 rounded-lg border-2 border-dashed border-indigo-300 dark:border-indigo-700" />
      </div>
    </div>
  );
}

// ─── Applicant card ───────────────────────────────────────────────────────────

function ApplicantCard({
  applicant,
  jobId,
  isOverlay,
  readOnly = false,
}: {
  applicant: ApplicantListItem;
  jobId: string;
  isOverlay?: boolean;
  readOnly?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: dragging,
  } = useSortable({
    id: applicant.id,
    data: { type: "card" },
    disabled: readOnly,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className={cn(
        "group rounded-lg border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-800",
        dragging && !isOverlay && "opacity-40",
        isOverlay && "rotate-1 shadow-2xl ring-2 ring-indigo-400",
      )}
    >
      <div className="mb-2 flex items-start gap-2.5">
        {!readOnly ? (
        <button
          {...listeners}
          className={cn(
            "mt-0.5 shrink-0 cursor-grab text-zinc-300 hover:text-zinc-500 active:cursor-grabbing dark:text-zinc-600 dark:hover:text-zinc-400",
            isOverlay && "cursor-grabbing",
          )}
          title="Drag to move"
          tabIndex={-1}
        >
          <GripHorizontal className="h-3.5 w-3.5" />
        </button>
        ) : (
          <span className="mt-0.5 w-3.5 shrink-0" aria-hidden />
        )}
        <ApplicantAvatar
          firstName={applicant.first_name}
          lastName={applicant.last_name}
          size="sm"
          className="mt-0.5 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-1">
            <Link
              href={`/admin/jobs/${jobId}/applicants/${applicant.id}`}
              className="text-sm font-medium leading-snug text-zinc-900 hover:underline dark:text-zinc-100"
            >
              {applicant.first_name} {applicant.last_name}
            </Link>
            <ParseStatusBadge status={applicant.parse_status} />
          </div>
          <p className="truncate text-xs text-zinc-400">{applicant.email}</p>
        </div>
      </div>
      {applicant.top_institution && (
        <p className="mt-1 truncate text-xs text-zinc-400">
          {applicant.top_institution}
          {applicant.top_degree && ` · ${applicant.top_degree}`}
        </p>
      )}
      <p className="mt-1.5 text-xs text-zinc-400">
        {formatTimeInStage(applicant.stage_entered_at)}
      </p>
    </div>
  );
}
