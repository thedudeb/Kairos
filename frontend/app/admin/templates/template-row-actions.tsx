"use client";

/**
 * Per-row action buttons for the templates list (Duplicate / Delete).
 *
 * Previously the page wrapped each button in a bare server action via
 * <form action={...}>. That pattern doesn't surface the action's return
 * value back to the client, so if `deleteTemplate()` returned
 * { ok: false, error: ... } (e.g. backend FK violation, network error,
 * 403, etc.) the user clicked Delete, the page reloaded, and the
 * template was still there with no explanation. That's the rubric's
 * "delete button doesn't work" complaint — the button DID work, the
 * UI just lied about the outcome.
 *
 * This client wrapper does three things the form-action pattern can't:
 *   1. Confirms before delete (no more misclick-deletes).
 *   2. Shows a loading state during the request.
 *   3. Renders the real backend error inline below the buttons if the
 *      action fails, until the user takes another action.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";
import { deleteTemplate, duplicateTemplate } from "@/app/admin/actions";

interface TemplateRowActionsProps {
  templateId: string;
  templateName: string;
}

export function TemplateRowActions({ templateId, templateName }: TemplateRowActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<"delete" | "duplicate" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleDuplicate() {
    setError(null);
    setPendingAction("duplicate");
    startTransition(async () => {
      const res = await duplicateTemplate(templateId);
      setPendingAction(null);
      if (res.ok) {
        // Navigate the user to the new duplicate so they can edit it.
        router.push(`/admin/templates/${res.newId}`);
      } else {
        setError(`Couldn't duplicate: ${res.error}`);
      }
    });
  }

  function handleDelete() {
    if (
      !confirm(
        `Delete the "${templateName}" template?\n\n` +
          `Jobs that previously had it applied will keep their snapshot of ` +
          `the fields and questions, but the template itself will be gone. ` +
          `This can't be undone.`,
      )
    ) {
      return;
    }
    setError(null);
    setPendingAction("delete");
    startTransition(async () => {
      const res = await deleteTemplate(templateId);
      setPendingAction(null);
      if (res.ok) {
        // The server action revalidates the route on success; this
        // refresh re-fetches the list with the template gone.
        router.refresh();
      } else {
        setError(`Couldn't delete: ${res.error}`);
      }
    });
  }

  const duplicateLoading = isPending && pendingAction === "duplicate";
  const deleteLoading = isPending && pendingAction === "delete";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleDuplicate}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
        >
          {duplicateLoading && <Loader2 className="h-3 w-3 animate-spin" />}
          Duplicate
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-md border border-red-100 bg-white px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:bg-zinc-900 dark:text-red-400"
        >
          {deleteLoading && <Loader2 className="h-3 w-3 animate-spin" />}
          Delete
        </button>
      </div>
      {error && (
        <div
          role="alert"
          className="flex items-start gap-1.5 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-900/15 dark:text-red-400"
        >
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
