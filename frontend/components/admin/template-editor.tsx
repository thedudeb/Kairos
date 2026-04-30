"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ApplicationFormPreview } from "./application-form-preview";
import { AssessmentQuestionsPreview } from "./assessment-questions-preview";
import { FormBuilder } from "./form-builder";
import { AssessmentQuestionsEditor } from "./assessment-questions-editor";
import { createTemplate, updateTemplate } from "@/app/admin/actions";
import type {
  AssessmentQuestionItem,
  FormFieldItem,
  TemplateOut,
} from "@/types/api";

type Tab = "fields" | "questions" | "preview";

const DEFAULT_QUESTIONS: AssessmentQuestionItem[] = Array.from(
  { length: 4 },
  (_, i) => ({
    id: `new-default-${i}`,
    question_text: "",
    max_duration_seconds: 120,
    max_attempts: 1,
    sort_order: i,
  }),
);

export function TemplateEditor({ template }: { template?: TemplateOut }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("fields");

  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");

  const [fields, setFields] = useState<Omit<FormFieldItem, "sort_order">[]>(
    template?.form_fields.map(({ sort_order: _, ...f }) => f) ?? [],
  );
  const [questions, setQuestions] = useState<Omit<AssessmentQuestionItem, "sort_order">[]>(
    template?.assessment_questions.map(({ sort_order: _, ...q }) => q) ??
      DEFAULT_QUESTIONS,
  );

  function notify(ok: boolean, msg: string) {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 4000);
  }

  function handleSave() {
    if (!name.trim()) {
      notify(false, "Template name is required.");
      return;
    }
    startTransition(async () => {
      const payload = {
        name: name.trim(),
        description: description.trim(),
        form_fields: fields.map((f, i) => ({ ...f, sort_order: i })),
        assessment_questions: questions.map((q, i) => ({ ...q, sort_order: i })),
      };

      if (template) {
        const res = await updateTemplate(template.id, payload);
        notify(res.ok, res.ok ? "Saved!" : `Error: ${"error" in res ? res.error : ""}`);
      } else {
        const res = await createTemplate(payload);
        if (res.ok) {
          router.push(`/admin/templates/${res.id}`);
        } else {
          notify(false, `Error: ${"error" in res ? res.error : ""}`);
        }
      }
    });
  }

  const TAB_ITEMS: { key: Tab; label: string }[] = [
    { key: "fields", label: "Form fields" },
    { key: "questions", label: "Assessment questions" },
    { key: "preview", label: "Preview" },
  ];

  const inputBase =
    "block w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-500";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/admin/templates"
            className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            ← Templates
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            {template ? "Edit template" : "New template"}
          </h1>
        </div>
        {template ? (
          <Link
            href={`/admin/templates/${template.id}/preview`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Full-page preview
            <ExternalLink className="h-3.5 w-3.5 text-zinc-400" />
          </Link>
        ) : null}
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`rounded-md border p-3 text-sm ${
            toast.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-400"
              : "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-400"
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Name + description */}
      <div className="grid gap-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium">Template name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Software Engineer"
            className={inputBase}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium">
            Description{" "}
            <span className="font-normal text-zinc-400">(optional, admin-facing)</span>
          </label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this template for?"
            className={inputBase}
          />
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 rounded-lg border border-zinc-200 bg-zinc-50 p-1 dark:border-zinc-800 dark:bg-zinc-900">
        {TAB_ITEMS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActiveTab(t.key)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === t.key
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100"
                : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Form fields */}
      {activeTab === "fields" && (
        <FormBuilder initialFields={template?.form_fields ?? []} onChange={setFields} />
      )}

      {/* Assessment questions */}
      {activeTab === "questions" && (
        <AssessmentQuestionsEditor
          initialQuestions={template?.assessment_questions ?? DEFAULT_QUESTIONS}
          onChange={setQuestions}
        />
      )}

      {/* Preview — mirrors public /careers/[slug] apply form */}
      {activeTab === "preview" && (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <ApplicationFormPreview
            heading={name.trim() || "Untitled template"}
            adminDescription={description.trim() || null}
            formFields={fields.map((f, i) => ({ ...f, sort_order: i }))}
          />

          <section className="mt-10 border-t border-zinc-200 pt-8 dark:border-zinc-800">
            <h3 className="mb-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Assessment questions
            </h3>
            <p className="mb-6 text-sm text-zinc-500">
              Reference only — sent to integrations when a candidate enters a linked pipeline stage,
              not shown on the public application form.
            </p>
            <AssessmentQuestionsPreview
              questions={questions.map((q, i) => ({ ...q, sort_order: i }))}
            />
          </section>
        </div>
      )}

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending || !name.trim()}
          className="rounded-md bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {isPending ? "Saving…" : template ? "Save changes" : "Create template"}
        </button>
        <Link href="/admin/templates" className="text-sm text-zinc-500 hover:text-zinc-700">
          Cancel
        </Link>
      </div>
    </div>
  );
}
