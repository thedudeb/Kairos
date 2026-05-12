"use client";

import React from "react";
import { Upload } from "lucide-react";
import type { FieldType } from "@/types/api";

/** Same shape as custom fields on the public job application form. */
export interface ApplicationCustomField {
  id: string;
  label: string;
  field_type: FieldType | string;
  is_required: boolean;
  options: string[] | null;
  sort_order: number;
  file_allowed_types?: string[] | null;
}

function fileAcceptAttr(types: string[] | null | undefined): string {
  if (!types?.length) {
    return [
      ".pdf",
      ".jpg",
      ".jpeg",
      ".png",
      ".webp",
      ".doc",
      ".docx",
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ].join(",");
  }
  const parts: string[] = [];
  for (const m of types) {
    parts.push(m);
    if (m === "application/pdf") parts.push(".pdf");
    if (m === "image/jpeg") parts.push(".jpg", ".jpeg");
    if (m === "image/png") parts.push(".png");
    if (m === "image/webp") parts.push(".webp");
    if (m === "application/msword") parts.push(".doc");
    if (m === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") parts.push(".docx");
  }
  return [...new Set(parts)].join(",");
}

function fileFieldHint(types: string[] | null | undefined): string {
  if (!types?.length) return "Common formats, max 10 MB";
  const labels = types.map((m) => {
    if (m === "application/pdf") return "PDF";
    if (m === "image/jpeg") return "JPEG";
    if (m === "image/png") return "PNG";
    if (m === "image/webp") return "WebP";
    if (m === "application/msword") return "DOC";
    if (m === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "DOCX";
    return m;
  });
  return `${labels.join(", ")} · max 10 MB`;
}

export const APPLICATION_INPUT_CLASS =
  "block w-full rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 disabled:bg-zinc-50 disabled:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-500 dark:focus:ring-zinc-700";

export function Field({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  /** Inline error message rendered below the input. */
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
        {hint && (
          <span className="ml-2 font-normal text-zinc-400">{hint}</span>
        )}
      </label>
      {children}
      {error && (
        <p className="mt-1.5 text-xs text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function FileDropZone({
  name,
  accept,
  required,
  disabled,
  filename,
  onChange,
  hint,
}: {
  name: string;
  accept: string;
  required?: boolean;
  disabled?: boolean;
  filename: string | null;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  hint?: string;
}) {
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  function handleDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (!file || !inputRef.current) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    inputRef.current.files = dt.files;
    inputRef.current.dispatchEvent(new Event("change", { bubbles: true }));
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        name={name}
        accept={accept}
        required={required}
        disabled={disabled}
        onChange={onChange}
        className="sr-only"
        id={`file-${name}`}
      />
      <label
        htmlFor={`file-${name}`}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors ${
          dragging
            ? "border-indigo-400 bg-indigo-50 dark:border-indigo-600 dark:bg-indigo-900/20"
            : filename
            ? "border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-900/10"
            : "border-zinc-200 bg-zinc-50 hover:border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-zinc-600"
        } ${disabled ? "pointer-events-none opacity-50" : ""}`}
      >
        <Upload
          className={`h-6 w-6 ${dragging ? "text-indigo-400" : filename ? "text-emerald-500" : "text-zinc-400"}`}
        />
        {filename ? (
          <>
            <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
              {filename}
            </span>
            <span className="text-xs text-zinc-400">Click or drag to change</span>
          </>
        ) : (
          <>
            <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
              {dragging ? "Drop to upload" : "Click or drag & drop"}
            </span>
            <span className="text-xs text-zinc-400">{hint ?? "PDF only, max 10 MB"}</span>
          </>
        )}
      </label>
    </div>
  );
}

export function CustomFieldInput({
  field,
  disabled,
  inputClassName,
  onFileChange,
  customFilename,
}: {
  field: ApplicationCustomField;
  disabled: boolean;
  inputClassName: string;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  customFilename: string | null;
}) {
  const fieldName = `custom_${field.id}`;
  const fileFieldName = `custom_file_${field.id}`;

  switch (field.field_type) {
    case "textarea":
      return (
        <textarea
          name={fieldName}
          required={field.is_required}
          disabled={disabled}
          rows={4}
          className={inputClassName}
        />
      );

    case "dropdown":
      return (
        <select
          name={fieldName}
          required={field.is_required}
          disabled={disabled}
          className={inputClassName}
          defaultValue=""
        >
          <option value="" disabled>
            Select an option
          </option>
          {(field.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );

    case "checkbox":
      return (
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            name={fieldName}
            required={field.is_required}
            disabled={disabled}
            className="h-4 w-4 rounded border-zinc-300 accent-zinc-900"
          />
          <span className="text-sm text-zinc-600 dark:text-zinc-400">Yes</span>
        </label>
      );

    case "file":
      return (
        <FileDropZone
          name={fileFieldName}
          accept={fileAcceptAttr(field.file_allowed_types)}
          required={field.is_required}
          disabled={disabled}
          filename={customFilename}
          onChange={onFileChange}
          hint={fileFieldHint(field.file_allowed_types)}
        />
      );

    case "email":
      return (
        <input
          type="email"
          name={fieldName}
          required={field.is_required}
          disabled={disabled}
          className={inputClassName}
        />
      );

    case "url":
      return (
        <input
          type="url"
          name={fieldName}
          required={field.is_required}
          disabled={disabled}
          placeholder="https://"
          className={inputClassName}
        />
      );

    case "number":
      return (
        <input
          type="number"
          name={fieldName}
          required={field.is_required}
          disabled={disabled}
          className={inputClassName}
        />
      );

    default:
      return (
        <input
          type="text"
          name={fieldName}
          required={field.is_required}
          disabled={disabled}
          className={inputClassName}
        />
      );
  }
}
