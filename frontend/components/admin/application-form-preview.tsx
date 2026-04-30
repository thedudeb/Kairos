"use client";

import {
  APPLICATION_INPUT_CLASS,
  CustomFieldInput,
  Field,
  FileDropZone,
  type ApplicationCustomField,
} from "@/components/forms/application-form-shared";
import type { FormFieldItem } from "@/types/api";

export interface ApplicationFormPreviewProps {
  /** Shown as the job / template title (e.g. template name or job title). */
  heading: string;
  /** Admin-only description — shown muted above the form in preview. */
  adminDescription?: string | null;
  /** Snapshot custom fields (same schema as public job form_fields). */
  formFields: FormFieldItem[];
}

/**
 * Read-only replica of the public apply form — matches spacing, labels, and control types.
 */
export function ApplicationFormPreview({
  heading,
  adminDescription,
  formFields,
}: ApplicationFormPreviewProps) {
  const sorted = [...formFields].sort((a, b) => a.sort_order - b.sort_order);
  const customFields: ApplicationCustomField[] = sorted.map((f) => ({
    id: f.id,
    label: f.label || "(No label)",
    field_type: f.field_type,
    is_required: f.is_required,
    options: f.options,
    sort_order: f.sort_order,
  }));

  const noopFile = () => {
    /* preview — file inputs disabled */
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
        <strong className="font-medium">Preview mode.</strong> This matches what applicants
        see on the job page (standard fields + your custom fields). Submissions are disabled.
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Preview
        </p>
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">{heading}</h2>
        {adminDescription ? (
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{adminDescription}</p>
        ) : null}
      </div>

      <div
        role="region"
        aria-label="Sample application form"
        className="pointer-events-none select-none space-y-5"
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="First name" required>
            <input
              type="text"
              defaultValue="Jane"
              className={APPLICATION_INPUT_CLASS}
              readOnly
              tabIndex={-1}
            />
          </Field>
          <Field label="Last name" required>
            <input
              type="text"
              defaultValue="Smith"
              className={APPLICATION_INPUT_CLASS}
              readOnly
              tabIndex={-1}
            />
          </Field>
        </div>

        <Field label="Email address" required>
          <input
            type="email"
            defaultValue="jane.smith@example.com"
            className={APPLICATION_INPUT_CLASS}
            readOnly
            tabIndex={-1}
          />
        </Field>

        <Field label="Phone number" required>
          <input
            type="tel"
            defaultValue="+1 (555) 000-0000"
            className={APPLICATION_INPUT_CLASS}
            readOnly
            tabIndex={-1}
          />
        </Field>

        <Field label="Resume" required hint="PDF only, max 10 MB">
          <FileDropZone
            name="resume_preview"
            accept=".pdf,application/pdf"
            disabled
            filename={null}
            onChange={noopFile}
          />
        </Field>

        {customFields.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/40">
            No custom fields yet — applicants only complete the standard fields above.
          </p>
        ) : (
          customFields.map((field) => (
            <Field key={field.id} label={field.label} required={field.is_required}>
              <CustomFieldInput
                field={field}
                disabled
                inputClassName={APPLICATION_INPUT_CLASS}
                onFileChange={noopFile}
                customFilename={null}
              />
            </Field>
          ))
        )}

        <div className="pt-2">
          <button
            type="button"
            disabled
            className="inline-flex w-full cursor-not-allowed items-center justify-center rounded-lg bg-zinc-200 px-6 py-3 text-sm font-semibold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 sm:w-auto"
          >
            Submit application
          </button>
        </div>
        </div>
    </div>
  );
}
