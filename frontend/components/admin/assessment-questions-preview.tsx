"use client";

import type { AssessmentQuestionItem } from "@/types/api";

export interface AssessmentQuestionsPreviewProps {
  questions: AssessmentQuestionItem[];
}

/**
 * Read-only cards showing assessment questions as configured for webhook payloads.
 */
export function AssessmentQuestionsPreview({ questions }: AssessmentQuestionsPreviewProps) {
  const sorted = [...questions].sort((a, b) => a.sort_order - b.sort_order);
  const visible = sorted.filter((q) => q.question_text.trim());

  if (visible.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/40">
        No assessment questions yet. When added, they can be attached to integration webhooks
        for selected pipeline stages.
      </p>
    );
  }

  return (
    <ol className="space-y-3">
      {visible.map((q, idx) => (
        <li
          key={q.id}
          className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900"
        >
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-400">
            Question {idx + 1}
          </p>
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {q.question_text}
          </p>
          <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-zinc-500">
            {q.max_duration_seconds != null && (
              <div>
                <dt className="inline font-medium text-zinc-400">Time limit</dt>{" "}
                <dd className="inline">{q.max_duration_seconds}s</dd>
              </div>
            )}
            <div>
              <dt className="inline font-medium text-zinc-400">Attempts</dt>{" "}
              <dd className="inline">{q.max_attempts}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ol>
  );
}
