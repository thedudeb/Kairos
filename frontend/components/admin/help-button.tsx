"use client";

import { useState } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  {
    title: "Jobs",
    description:
      "Create job listings with a title, slug, and description. Each job has its own public application page at /careers/{slug}.",
    tip: "Publish a draft to make it live, or close it when hiring is done.",
  },
  {
    title: "Application form builder",
    description:
      "Every job comes with standard fields — name, email, phone, and resume. Add custom fields (text, dropdowns, file uploads, URLs) from the job's Settings tab.",
    tip: "Save reusable field sets as templates to apply across multiple jobs.",
  },
  {
    title: "Applicant list",
    description:
      "Browse, search, and filter everyone who applied to a job. Sort by name, date, or stage, and group by stage, institution, or degree.",
    tip: "Export the full list to CSV at any time from the top of the list.",
  },
  {
    title: "Resume intelligence",
    description:
      "Resumes are parsed automatically in the background using Gemini AI — extracting education, work history, and skills.",
    tip: "Click Re-parse on any applicant's profile to re-run the AI, or use the edit button to correct any field manually.",
  },
  {
    title: "Pipeline & Kanban board",
    description:
      "Each job has its own pipeline stages. Drag applicants between stages on the Kanban board, or move them from their profile page.",
    tip: "Switch to Manage mode on the board to add, rename, reorder, or delete stages.",
  },
  {
    title: "Analytics",
    description:
      "The job overview page shows application volume over time, stage breakdown, top institutions, degree distribution, and parse status.",
    tip: "Use the date picker to filter charts to any custom range.",
  },
  {
    title: "Templates",
    description:
      "Build reusable libraries of form fields and assessment questions from the Templates page.",
    tip: "Duplicate any template to use it as a starting point for a new one.",
  },
  {
    title: "Integrations & webhooks",
    description:
      "Add a webhook to any job and Kairos will POST to your URL whenever an applicant moves stage — with a full payload including parsed resume data.",
    tip: "Check the delivery log on the Integrations tab to inspect payloads and retry failed requests.",
  },
  {
    title: "Public careers portal",
    description:
      "All active jobs appear automatically at /careers. Each has its own branded page with a description and application form.",
    tip: "Closed jobs show a polite \"position filled\" page so candidates always get a clear answer.",
  },
];

export function HelpButton() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  function handleOpen() {
    setStep(0);
    setOpen(true);
  }

  function handleClose() {
    setOpen(false);
  }

  const current = STEPS[step];
  const isFirst = step === 0;
  const isLast = step === STEPS.length - 1;

  return (
    <>
      <button
        onClick={handleOpen}
        title="How to use Kairos"
        aria-label="Help"
        className="hidden rounded px-1.5 py-0.5 font-mono text-xs text-zinc-400 ring-1 ring-zinc-200 transition-colors hover:text-zinc-600 dark:ring-zinc-700 dark:hover:text-zinc-300 sm:block"
      >
        ?
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={handleClose}
        >
          <div
            className="relative w-full max-w-md rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close */}
            <button
              onClick={handleClose}
              className="absolute right-4 top-4 rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Step content */}
            <div className="px-8 pb-6 pt-8 text-center">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                {current.title}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
                {current.description}
              </p>
              <div className="mt-4 rounded-lg bg-indigo-50 px-4 py-3 text-xs leading-relaxed text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
                {current.tip}
              </div>
            </div>

            {/* Progress dots */}
            <div className="flex justify-center gap-1.5 pb-4">
              {STEPS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setStep(i)}
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    i === step
                      ? "w-4 bg-indigo-500"
                      : "w-1.5 bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600",
                  )}
                />
              ))}
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between border-t border-zinc-100 px-6 py-4 dark:border-zinc-800">
              <button
                onClick={() => setStep((s) => s - 1)}
                disabled={isFirst}
                className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-500 transition-colors hover:bg-zinc-100 disabled:opacity-0 dark:hover:bg-zinc-800"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </button>

              <span className="text-xs text-zinc-400">
                {step + 1} / {STEPS.length}
              </span>

              {isLast ? (
                <button
                  onClick={handleClose}
                  className="inline-flex items-center gap-1 rounded-lg bg-indigo-500 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-600"
                >
                  Done
                </button>
              ) : (
                <button
                  onClick={() => setStep((s) => s + 1)}
                  className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-500 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
