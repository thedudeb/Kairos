"use client";

import { useRef, useState, useTransition } from "react";
import { CheckCircle, Loader2 } from "lucide-react";
import {
  APPLICATION_INPUT_CLASS,
  CustomFieldInput,
  Field,
  FileDropZone,
  type ApplicationCustomField,
} from "@/components/forms/application-form-shared";
import { submitApplication } from "./actions";
import type { SubmitApplicationResult } from "./actions";

interface ApplicationFormProps {
  slug: string;
  customFields: ApplicationCustomField[];
}

type FormState = "idle" | "submitting" | "success" | "error";

type FieldErrors = Partial<Record<"phone", string>>;

/**
 * Validate a phone number. Permissive enough for international formats
 * (spaces, dashes, parens, dots, leading +) but rejects pure-text inputs.
 *
 * Returns null when valid, otherwise an error message suitable for inline
 * display. The check counts actual digits (must be 7–15 per E.164) and
 * confirms the original string only contains digits + common separators —
 * so "abc def" and "5551234 ext. 99" both fail, but "+1 (555) 123-4567"
 * passes.
 */
function validatePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return "Phone number is required.";
  if (!/^[+\d\s().\-]+$/.test(trimmed)) {
    return "Phone number can only contain digits, spaces, +, -, ( ) and dots.";
  }
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 7) return "Phone number is too short.";
  if (digits.length > 15) return "Phone number is too long.";
  return null;
}

export function ApplicationForm({ slug, customFields }: ApplicationFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState<FormState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string>("");
  const [resumeFilename, setResumeFilename] = useState<string | null>(null);
  const [customFileNames, setCustomFileNames] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  function handleResumeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.includes("pdf")) {
        e.target.value = "";
        setResumeFilename(null);
        setErrorMessage("Only PDF files are accepted for resume uploads.");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        e.target.value = "";
        setResumeFilename(null);
        setErrorMessage("Resume file must be under 10 MB.");
        return;
      }
      setResumeFilename(file.name);
      setErrorMessage(null);
    }
  }

  function handleCustomFileChange(fieldId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setCustomFileNames((prev) => ({ ...prev, [fieldId]: file.name }));
    }
  }

  function handleFormChange() {
    // Clear server-side errors when the user edits the form after a failed attempt.
    if (state === "error") {
      setState("idle");
      setErrorMessage(null);
    }
  }

  function handlePhoneChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Only re-validate live once the user has already seen an error — avoid
    // yelling at them while they're still typing the first number.
    if (fieldErrors.phone) {
      const err = validatePhone(e.target.value);
      setFieldErrors((prev) => ({ ...prev, phone: err ?? undefined }));
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!formRef.current) return;

    setErrorMessage(null);

    // Client-side validation before hitting the server.
    const formData = new FormData(formRef.current);
    const phoneRaw = (formData.get("phone") as string | null) ?? "";
    const phoneError = validatePhone(phoneRaw);
    if (phoneError) {
      setFieldErrors({ phone: phoneError });
      // Focus the phone field so the user can correct it immediately.
      const phoneInput = formRef.current.querySelector<HTMLInputElement>('input[name="phone"]');
      phoneInput?.focus();
      return;
    }
    setFieldErrors({});

    setState("submitting");

    startTransition(async () => {
      const result: SubmitApplicationResult = await submitApplication(slug, formData);

      if (result.ok) {
        setState("success");
        setSuccessMessage(result.message);
        formRef.current?.reset();
        setResumeFilename(null);
        setCustomFileNames({});
      } else {
        setState("error");
        setErrorMessage(result.message);
      }
    });
  }

  if (state === "success") {
    return (
      <div className="flex flex-col items-center py-8 text-center">
        <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
          <CheckCircle className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
        </div>
        <h3 className="mb-2 text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          Application submitted!
        </h3>
        <p className="max-w-sm text-zinc-500 dark:text-zinc-400">
          {successMessage}
        </p>
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} onChange={handleFormChange} className="space-y-5" noValidate>
      {/* Default fields */}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="First name" required>
          <input
            name="first_name"
            type="text"
            required
            autoComplete="given-name"
            placeholder="Jane"
            className={APPLICATION_INPUT_CLASS}
            disabled={isPending}
          />
        </Field>
        <Field label="Last name" required>
          <input
            name="last_name"
            type="text"
            required
            autoComplete="family-name"
            placeholder="Smith"
            className={APPLICATION_INPUT_CLASS}
            disabled={isPending}
          />
        </Field>
      </div>

      <Field label="Email address" required>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="jane@example.com"
          className={APPLICATION_INPUT_CLASS}
          disabled={isPending}
        />
      </Field>

      <Field label="Phone number" required error={fieldErrors.phone}>
        <input
          name="phone"
          type="tel"
          inputMode="tel"
          required
          autoComplete="tel"
          placeholder="+1 (555) 000-0000"
          pattern="^[+\d\s().\-]+$"
          aria-invalid={fieldErrors.phone ? true : undefined}
          aria-describedby={fieldErrors.phone ? "phone-error" : undefined}
          onChange={handlePhoneChange}
          className={APPLICATION_INPUT_CLASS}
          disabled={isPending}
        />
      </Field>

      <Field label="Resume" required hint="PDF only, max 10 MB">
        <FileDropZone
          name="resume"
          accept=".pdf,application/pdf"
          required
          disabled={isPending}
          filename={resumeFilename}
          onChange={handleResumeChange}
        />
      </Field>

      {/* Custom fields. Skip any rows with empty labels — historic data may
          have unlabeled fields saved before backend validation existed, and
          rendering them produces ghost input boxes with no context. */}
      {customFields
        .filter((field) => field.label.trim())
        .map((field) => (
          <Field key={field.id} label={field.label} required={field.is_required}>
            <CustomFieldInput
              field={field}
              disabled={isPending}
              inputClassName={APPLICATION_INPUT_CLASS}
              onFileChange={(e) => handleCustomFileChange(field.id, e)}
              customFilename={customFileNames[field.id] ?? null}
            />
          </Field>
        ))}

      {/* Error banner */}
      {state === "error" && errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-400">
          {errorMessage}
        </div>
      )}

      {/* Inline error (e.g. file type) when not yet submitted */}
      {state !== "error" && errorMessage && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-900/20 dark:text-amber-400">
          {errorMessage}
        </div>
      )}

      <div className="pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 sm:w-auto"
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Submitting…
            </>
          ) : (
            "Submit application"
          )}
        </button>
      </div>
    </form>
  );
}
