"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { FormBuilder } from "@/components/admin/form-builder";
import { AssessmentQuestionsEditor } from "@/components/admin/assessment-questions-editor";
import {
  applyTemplate,
  updateJobAssessmentQuestions,
  updateJobFormFields,
  updateJobMeta,
} from "@/app/admin/actions";
import type {
  AssessmentQuestionItem,
  FormFieldItem,
  JobOut,
  TemplateSummary,
} from "@/types/api";

type Tab = "meta" | "fields" | "questions" | "template";

export function JobSettingsEditor({
  job,
  templates,
}: {
  job: JobOut;
  templates: TemplateSummary[];
}) {
  const [activeTab, setActiveTab] = useState<Tab>("meta");
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  function notify(ok: boolean, msg: string) {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 4000);
  }

  // ── Meta tab state ──────────────────────────────────────────────────────────
  const [title, setTitle] = useState(job.title);
  const [slug, setSlug] = useState(job.slug);
  const [description, setDescription] = useState(job.description_md);

  // ── Fields tab state ────────────────────────────────────────────────────────
  const [fields, setFields] = useState<Omit<FormFieldItem, "sort_order">[]>(
    job.form_fields.map(({ sort_order: _, ...f }) => f),
  );

  // ── Questions tab state ─────────────────────────────────────────────────────
  const [questions, setQuestions] = useState<Omit<AssessmentQuestionItem, "sort_order">[]>(
    job.assessment_questions.map(({ sort_order: _, ...q }) => q),
  );

  // ── Template tab state ──────────────────────────────────────────────────────
  const [selectedTemplateId, setSelectedTemplateId] = useState(job.template_id ?? "");

  function saveMeta() {
    startTransition(async () => {
      const res = await updateJobMeta(job.id, {
        title,
        slug,
        description_md: description,
      });
      notify(res.ok, res.ok ? "Saved!" : `Error: ${"error" in res ? res.error : ""}`);
    });
  }

  function saveFields() {
    startTransition(async () => {
      const payload = fields.map((f, i) => ({ ...f, sort_order: i }));
      const res = await updateJobFormFields(job.id, payload);
      notify(res.ok, res.ok ? "Saved!" : `Error: ${"error" in res ? res.error : ""}`);
    });
  }

  function saveQuestions() {
    startTransition(async () => {
      const payload = questions.map((q, i) => ({ ...q, sort_order: i }));
      const res = await updateJobAssessmentQuestions(job.id, payload);
      notify(res.ok, res.ok ? "Saved!" : `Error: ${"error" in res ? res.error : ""}`);
    });
  }

  function applySelectedTemplate() {
    if (!selectedTemplateId) return;
    startTransition(async () => {
      const res = await applyTemplate(job.id, selectedTemplateId);
      if (res.ok) {
        notify(true, "Template applied — reload to see updated fields.");
      } else {
        notify(false, `Error: ${"error" in res ? res.error : ""}`);
      }
    });
  }

  const TAB_ITEMS: { key: Tab; label: string }[] = [
    { key: "meta", label: "Details" },
    { key: "fields", label: "Form fields" },
    { key: "questions", label: "Assessment questions" },
    { key: "template", label: "Template" },
  ];

  const inputBase =
    "block w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-500";

  return (
    <div className="space-y-6">
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

      {/* Details */}
      {activeTab === "meta" && (
        <div className="space-y-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Job title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputBase} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">URL slug</label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-zinc-400">/careers/</span>
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className={`${inputBase} flex-1`}
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Description (Markdown)</label>
            <textarea
              rows={10}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={inputBase}
            />
          </div>
          <SaveButton onClick={saveMeta} disabled={isPending} />
        </div>
      )}

      {/* Form fields */}
      {activeTab === "fields" && (
        <div className="space-y-4">
          <p className="text-sm text-zinc-500">
            The four default fields (First name, Last name, Email, Phone, Resume) are always
            present and cannot be removed. Add additional custom fields below.
          </p>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="grid grid-cols-2 gap-1 opacity-60 sm:grid-cols-4">
              {["First name", "Last name", "Email", "Phone", "Resume"].map((f) => (
                <span key={f} className="text-xs text-zinc-500">
                  ⊘ {f}
                </span>
              ))}
            </div>
          </div>
          <FormBuilder
            initialFields={job.form_fields}
            onChange={setFields}
          />
          <SaveButton onClick={saveFields} disabled={isPending} />
        </div>
      )}

      {/* Assessment questions */}
      {activeTab === "questions" && (
        <div className="space-y-4">
          <p className="text-sm text-zinc-500">
            These questions are sent to the configured external assessment platform when a
            candidate reaches a stage with an integration that has &lsquo;include assessment&rsquo;
            toggled on.
          </p>
          <AssessmentQuestionsEditor
            initialQuestions={job.assessment_questions}
            onChange={setQuestions}
          />
          <SaveButton onClick={saveQuestions} disabled={isPending} />
        </div>
      )}

      {/* Template */}
      {activeTab === "template" && (
        <div className="space-y-4">
          <p className="text-sm text-zinc-500">
            Applying a template snapshot-copies its custom form fields and assessment questions onto
            this job. Existing fields will be replaced. Changes to the template later will not
            affect this job.
          </p>
          {templates.length === 0 ? (
            <p className="text-sm text-zinc-400 italic">
              No templates yet.{" "}
              <Link href="/admin/templates/new" className="underline">
                Create one
              </Link>
              .
            </p>
          ) : (
            <div className="space-y-3">
              <select
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                className={inputBase}
              >
                <option value="">— Select a template —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.description ? ` — ${t.description}` : ""}
                  </option>
                ))}
              </select>
              {job.template_id && (
                <p className="text-xs text-zinc-500">
                  Currently applied: template ID{" "}
                  <code className="font-mono">{job.template_id.slice(0, 8)}</code>
                </p>
              )}
              <button
                type="button"
                disabled={!selectedTemplateId || isPending}
                onClick={applySelectedTemplate}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                Apply template
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SaveButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-md bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
    >
      {disabled ? "Saving…" : "Save changes"}
    </button>
  );
}
