"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, X } from "lucide-react";
import type { PipelineStage } from "@/types/api";
import { moveApplicantStage } from "../actions";
import { OutreachModal } from "./outreach-modal";
import { cn } from "@/lib/utils";

interface StageMoverProps {
  jobId: string;
  applicantId: string;
  applicantName: string;
  applicantEmail: string;
  jobTitle: string;
  stages: PipelineStage[];
  currentStageId: string;
  readOnly?: boolean;
}

export function StageMover({
  jobId,
  applicantId,
  applicantName,
  applicantEmail,
  jobTitle,
  stages,
  currentStageId,
  readOnly = false,
}: StageMoverProps) {
  const [isPending, startTransition] = useTransition();
  const [pendingStageId, setPendingStageId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [outreachStage, setOutreachStage] = useState<{ id: string; name: string } | null>(null);
  const router = useRouter();

  const sortedStages = stages.slice().sort((a, b) => a.sort_order - b.sort_order);

  if (readOnly) {
    const cur = sortedStages.find((s) => s.id === currentStageId);
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Current stage:{" "}
        <span className="font-medium text-zinc-900 dark:text-zinc-100">{cur?.name ?? "—"}</span>
      </p>
    );
  }

  function handleStageClick(stageId: string) {
    if (stageId === currentStageId || isPending) return;
    setPendingStageId(stageId);
    setNotes("");
  }

  function handleConfirm() {
    if (!pendingStageId || isPending) return;
    const targetStage = sortedStages.find((s) => s.id === pendingStageId);
    startTransition(async () => {
      await moveApplicantStage(jobId, applicantId, pendingStageId, notes.trim() || undefined);
      setPendingStageId(null);
      setNotes("");
      router.refresh();
      // Show outreach modal after stage move (skip for terminal/rejection stages)
      if (targetStage && !targetStage.is_terminal) {
        setOutreachStage({ id: targetStage.id, name: targetStage.name });
      }
    });
  }

  function handleCancel() {
    setPendingStageId(null);
    setNotes("");
  }

  return (
    <>
      <div className="space-y-1.5">
        {sortedStages.map((stage) => {
          const isCurrent = stage.id === currentStageId;
          const isPendingTarget = stage.id === pendingStageId;

          return (
            <button
              key={stage.id}
              onClick={() => handleStageClick(stage.id)}
              disabled={isCurrent || isPending}
              className={cn(
                "flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors",
                isCurrent
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-medium cursor-default"
                  : isPendingTarget
                    ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100 font-medium"
                    : "text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-800 cursor-pointer",
              )}
            >
              <span>{stage.name}</span>
              {isCurrent && (
                isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )
              )}
            </button>
          );
        })}

        {pendingStageId && (
          <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/50">
            <p className="mb-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Note (optional)
            </p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Reason for moving stage…"
              rows={2}
              disabled={isPending}
              autoFocus
              className="block w-full resize-none rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
            <div className="mt-2 flex gap-2">
              <button
                onClick={handleConfirm}
                disabled={isPending}
                className="inline-flex items-center gap-1 rounded-md bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                Move
              </button>
              <button
                onClick={handleCancel}
                disabled={isPending}
                className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 disabled:opacity-50"
              >
                <X className="h-3 w-3" /> Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {outreachStage && (
        <OutreachModal
          jobId={jobId}
          applicantId={applicantId}
          applicantName={applicantName}
          applicantEmail={applicantEmail}
          stageName={outreachStage.name}
          jobTitle={jobTitle}
          onClose={() => setOutreachStage(null)}
        />
      )}
    </>
  );
}
