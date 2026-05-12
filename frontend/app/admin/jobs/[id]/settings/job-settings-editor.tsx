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
  JobDescriptionKind,
  JobOut,
  TemplateSummary,
} from "@/types/api";

type Tab = "meta" | "fields" | "questions" | "template";

function withoutSortOrder<T extends { sort_order: number }>(item: T): Omit<T, "sort_order"> {
  const { sort_order, ...rest } = item;
  void sort_order;
  return rest;
}

export function JobSettingsEditor({
  job,
  templates,
  readOnly = false,
}: {
  job: JobOut;
  templates: TemplateSummary[];
  readOnly?: boolean;
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
  const [descKind, setDescKind] = useState<JobDescriptionKind>(job.description_kind ?? "markdown");
  const [extUrl, setExtUrl] = useState(job.description_external_url ?? "");
  const [summary, setSummary] = useState(job.description_summary ?? "");

  // ── Fields tab state ────────────────────────────────────────────────────────
  const [fields, setFields] = useState<Omit<FormFieldItem, "sort_order">[]>(
    job.form_fields.map(withoutSortOrder),
  );

  // ── Questions tab state ─────────────────────────────────────────────────────
  const [questions, setQuestions] = useState<Omit<AssessmentQuestionItem, "sort_order">[]>(
    job.assessment_questions.map(withoutSortOrder),
  );

  // ── Template tab state ──────────────────────────────────────────────────────
  const [selectedTemplateId, setSelectedTemplateId] = useState(job.template_id ?? "");

  function saveMeta() {
    startTransition(async () => {
      const res = await updateJobMeta(job.id, {
        title,
        slug,
        description_md: description,
        description_kind: descKind,
        description_external_url: descKind === "external" ? extUrl.trim() || null : null,
        description_summary: descKind === "external" ? summary.trim() || null : null,
      });
      notify(res.ok, res.ok ? "Saved!" : `Error: ${"error" in res ? res.error : ""}`);
    });
  }

  function saveFields() {
    // Reject empty labels — they render as blank input boxes on the public
    // application form. Surface the issue inline rather than silently
    // saving garbage.
    const badIdx = fields.findIndex((f) => !f.label.trim());
    if (badIdx !== -1) {
      notify(false, `Custom field #${badIdx + 1} needs a label.`);
      return;
    }
    // Dropdown fields must have at least one option, otherwise the public
    // form renders an empty <select>.
    const badDropdown = fields.findIndex(
      (f) => f.field_type === "dropdown" && (!f.options || f.options.length === 0),
    );
    if (badDropdown !== -1) {
      notify(false, `Dropdown field #${badDropdown + 1} needs at least one option.`);
      return;
    }
    startTransition(async () => {
      const payload = fields.map((f, i) => ({ ...f, sort_order: i }));
      const res = await updateJobFormFields(job.id, payload);
      notify(res.ok, res.ok ? "Saved!" : `Error: ${"error" in res ? res.error : ""}`);
    });
  }

  function saveQuestions() {
    // Reject empty question text for the same reason.
    const badIdx = questions.findIndex((q) => !q.question_text.trim());
    if (badIdx !== -1) {
      notify(false, `Assessment question #${badIdx + 1} needs question text.`);
      return;
    }
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
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputBase} disabled={readOnly} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">URL slug</label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-zinc-400">/careers/</span>
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className={`${inputBase} flex-1`}
                disabled={readOnly}
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Description source</label>
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="descKind"
                  checked={descKind === "markdown"}
                  onChange={() => setDescKind("markdown")}
                  disabled={readOnly}
                  className="h-4 w-4 accent-zinc-900"
                />
                Markdown on this page
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="descKind"
                  checked={descKind === "external"}
                  onChange={() => setDescKind("external")}
                  disabled={readOnly}
                  className="h-4 w-4 accent-zinc-900"
                />
                External link (HTTPS)
              </label>
            </div>
          </div>
          {descKind === "markdown" ? (
            <div>
              <label className="mb-1.5 block text-sm font-medium">Description (Markdown)</label>
              <textarea
                rows={10}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={inputBase}
                disabled={readOnly}
              />
            </div>
          ) : (
            <>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Full description URL (HTTPS)</label>
                <input
                  type="url"
                  value={extUrl}
                  onChange={(e) => setExtUrl(e.target.value)}
                  placeholder="https://docs.google.com/..."
                  className={inputBase}
                  disabled={readOnly}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Short summary <span className="font-normal text-zinc-400">(optional, shown on posting)</span>
                </label>
                <textarea
                  rows={4}
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="Brief intro shown above the “View full description” link."
                  className={inputBase}
                  disabled={readOnly}
                />
              </div>
            </>
          )}
          {readOnly ? (
            <p className="text-sm text-zinc-500">You have read-only access. Ask an admin to change job settings.</p>
          ) : (
            <SaveButton onClick={saveMeta} disabled={isPending} />
          )}
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
            readOnly={readOnly}
          />
          {!readOnly && <SaveButton onClick={saveFields} disabled={isPending} />}
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
            readOnly={readOnly}
          />
          {!readOnly && <SaveButton onClick={saveQuestions} disabled={isPending} />}
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
                disabled={!selectedTemplateId || isPending || readOnly}
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
