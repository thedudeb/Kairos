"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Plus, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { SortableItem } from "./sortable-item";
import type { FieldType, FormFieldItem } from "@/types/api";
import { cn } from "@/lib/utils";

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: "text", label: "Short text" },
  { value: "textarea", label: "Long text" },
  { value: "email", label: "Email" },
  { value: "url", label: "URL" },
  { value: "number", label: "Number" },
  { value: "file", label: "File upload" },
  { value: "dropdown", label: "Dropdown" },
  { value: "checkbox", label: "Checkbox" },
];

const FILE_MIME_OPTIONS: { mime: string; label: string }[] = [
  { mime: "application/pdf", label: "PDF" },
  { mime: "image/jpeg", label: "JPEG" },
  { mime: "image/png", label: "PNG" },
  { mime: "image/webp", label: "WebP" },
  { mime: "application/msword", label: "DOC" },
  { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", label: "DOCX" },
];

type DraftField = Omit<FormFieldItem, "sort_order">;

interface FormBuilderProps {
  initialFields: FormFieldItem[];
  /** Called whenever the internal field list changes. Parent should store and submit. */
  onChange: (fields: DraftField[]) => void;
  /** If true the builder is rendered as read-only (for template preview). */
  readOnly?: boolean;
}

function newField(): DraftField {
  return {
    id: `new-${Math.random().toString(36).slice(2)}`,
    label: "",
    field_type: "text",
    is_required: false,
    options: null,
    file_allowed_types: null,
  };
}

export function FormBuilder({ initialFields, onChange, readOnly = false }: FormBuilderProps) {
  const [fields, setFields] = useState<DraftField[]>(() =>
    initialFields.map(({ sort_order: _, ...f }) => f),
  );

  const uid = useId();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function update(next: DraftField[]) {
    setFields(next);
    onChange(next);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIdx = fields.findIndex((f) => f.id === active.id);
      const newIdx = fields.findIndex((f) => f.id === over.id);
      update(arrayMove(fields, oldIdx, newIdx));
    }
  }

  function addField() {
    update([...fields, newField()]);
  }

  function removeField(id: string) {
    update(fields.filter((f) => f.id !== id));
  }

  function patchField(id: string, patch: Partial<DraftField>) {
    update(fields.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }

  function patchOptions(id: string, raw: string) {
    const options = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    patchField(id, { options: options.length ? options : null });
  }

  return (
    <div className="space-y-3">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
          {fields.map((field) => (
            <SortableItem key={field.id} id={field.id}>
              <FieldRow
                field={field}
                readOnly={readOnly}
                uid={uid}
                onPatch={(patch) => patchField(field.id, patch)}
                onPatchOptions={(raw) => patchOptions(field.id, raw)}
                onPatchFileTypes={(mime, checked) => {
                  const cur = new Set(field.file_allowed_types ?? []);
                  if (checked) cur.add(mime);
                  else cur.delete(mime);
                  const arr = [...cur];
                  patchField(field.id, { file_allowed_types: arr.length ? arr : null });
                }}
                onRemove={() => removeField(field.id)}
              />
            </SortableItem>
          ))}
        </SortableContext>
      </DndContext>

      {fields.length === 0 && (
        <p className="text-sm text-zinc-500 italic">No custom fields yet.</p>
      )}

      {!readOnly && (
        <button
          type="button"
          onClick={addField}
          className="flex items-center gap-1.5 rounded-md border border-dashed border-zinc-300 px-3 py-2 text-sm text-zinc-500 transition-colors hover:border-zinc-400 hover:text-zinc-700 dark:border-zinc-700 dark:hover:border-zinc-500 dark:hover:text-zinc-300"
        >
          <Plus className="h-4 w-4" />
          Add field
        </button>
      )}
    </div>
  );
}

interface FieldRowProps {
  field: DraftField;
  readOnly: boolean;
  uid: string;
  onPatch: (patch: Partial<DraftField>) => void;
  onPatchOptions: (raw: string) => void;
  onPatchFileTypes: (mime: string, checked: boolean) => void;
  onRemove: () => void;
}

function FieldRow({ field, readOnly, uid, onPatch, onPatchOptions, onPatchFileTypes, onRemove }: FieldRowProps) {
  const inputBase =
    "block w-full rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm shadow-sm outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 disabled:bg-zinc-50 disabled:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-500 dark:focus:ring-zinc-700";

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap gap-3">
        {/* Label */}
        <div className="min-w-[160px] flex-[2]">
          <label className="mb-1 block text-xs font-medium text-zinc-500">Label</label>
          <input
            disabled={readOnly}
            value={field.label}
            onChange={(e) => onPatch({ label: e.target.value })}
            placeholder="e.g. Cover Letter"
            className={inputBase}
          />
        </div>

        {/* Type */}
        <div className="min-w-[140px] flex-1">
          <label className="mb-1 block text-xs font-medium text-zinc-500">Type</label>
          <select
            disabled={readOnly}
            value={field.field_type}
            onChange={(e) => onPatch({ field_type: e.target.value as FieldType })}
            className={inputBase}
          >
            {FIELD_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        {/* Required toggle */}
        <div className="flex flex-col justify-end pb-0.5">
          <label className="mb-1 block text-xs font-medium text-zinc-500">Required</label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              disabled={readOnly}
              checked={field.is_required}
              onChange={(e) => onPatch({ is_required: e.target.checked })}
              className="h-4 w-4 rounded border-zinc-300 accent-zinc-900"
            />
            <span className="text-sm text-zinc-700 dark:text-zinc-300">Yes</span>
          </label>
        </div>

        {/* Remove button */}
        {!readOnly && (
          <div className="flex flex-col justify-end">
            <button
              type="button"
              onClick={onRemove}
              className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
              aria-label="Remove field"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Options (dropdown only) */}
      {field.field_type === "dropdown" && (
        <div className="mt-3">
          <label className="mb-1 block text-xs font-medium text-zinc-500">
            Options <span className="font-normal">(comma-separated)</span>
          </label>
          <input
            disabled={readOnly}
            value={field.options?.join(", ") ?? ""}
            onChange={(e) => onPatchOptions(e.target.value)}
            placeholder="Option A, Option B, Option C"
            className={inputBase}
          />
        </div>
      )}

      {field.field_type === "file" && (
        <div className="mt-3">
          <label className="mb-1 block text-xs font-medium text-zinc-500">
            Allowed file types <span className="font-normal">(none = all common types)</span>
          </label>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {FILE_MIME_OPTIONS.map(({ mime, label }) => (
              <label key={mime} className="flex items-center gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
                <input
                  type="checkbox"
                  disabled={readOnly}
                  checked={field.file_allowed_types?.includes(mime) ?? false}
                  onChange={(e) => onPatchFileTypes(mime, e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-300 accent-zinc-900"
                />
                {label}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
