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
import { useState } from "react";
import { SortableItem } from "./sortable-item";
import type { AssessmentQuestionItem } from "@/types/api";

type DraftQuestion = Omit<AssessmentQuestionItem, "sort_order">;

function withoutSortOrder(item: AssessmentQuestionItem): DraftQuestion {
  const { sort_order, ...rest } = item;
  void sort_order;
  return rest;
}

interface AssessmentQuestionsEditorProps {
  initialQuestions: AssessmentQuestionItem[];
  onChange: (questions: DraftQuestion[]) => void;
  readOnly?: boolean;
}

function newQuestion(): DraftQuestion {
  return {
    id: `new-${Math.random().toString(36).slice(2)}`,
    question_text: "",
    max_duration_seconds: 120,
    max_attempts: 1,
  };
}

export function AssessmentQuestionsEditor({
  initialQuestions,
  onChange,
  readOnly = false,
}: AssessmentQuestionsEditorProps) {
  const [questions, setQuestions] = useState<DraftQuestion[]>(() =>
    initialQuestions.map(withoutSortOrder),
  );

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function update(next: DraftQuestion[]) {
    setQuestions(next);
    onChange(next);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIdx = questions.findIndex((q) => q.id === active.id);
      const newIdx = questions.findIndex((q) => q.id === over.id);
      update(arrayMove(questions, oldIdx, newIdx));
    }
  }

  function addQuestion() {
    update([...questions, newQuestion()]);
  }

  function removeQuestion(id: string) {
    update(questions.filter((q) => q.id !== id));
  }

  function patchQuestion(id: string, patch: Partial<DraftQuestion>) {
    update(questions.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  }

  const inputBase =
    "block w-full rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm shadow-sm outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 disabled:bg-zinc-50 disabled:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-500 dark:focus:ring-zinc-700";

  return (
    <div className="space-y-3">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext
          items={questions.map((q) => q.id)}
          strategy={verticalListSortingStrategy}
        >
          {questions.map((q, idx) => (
            <SortableItem key={q.id} id={q.id}>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-400">Question {idx + 1}</span>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => removeQuestion(q.id)}
                      className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                      aria-label="Remove question"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-500">
                      Question text <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      disabled={readOnly}
                      value={q.question_text}
                      onChange={(e) => patchQuestion(q.id, { question_text: e.target.value })}
                      rows={2}
                      placeholder="e.g. Tell us about a challenging project you led."
                      aria-invalid={!q.question_text.trim() ? true : undefined}
                      className={
                        !q.question_text.trim()
                          ? inputBase + " !border-red-300 focus:!border-red-400 focus:!ring-red-200 dark:!border-red-900 dark:focus:!border-red-700 dark:focus:!ring-red-900"
                          : inputBase
                      }
                    />
                    {!q.question_text.trim() && !readOnly && (
                      <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                        Required — empty questions won&apos;t save.
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <div className="flex-1">
                      <label className="mb-1 block text-xs font-medium text-zinc-500">
                        Max recording (seconds)
                      </label>
                      <input
                        type="number"
                        disabled={readOnly}
                        value={q.max_duration_seconds ?? ""}
                        onChange={(e) =>
                          patchQuestion(q.id, {
                            max_duration_seconds: e.target.value
                              ? Number(e.target.value)
                              : null,
                          })
                        }
                        placeholder="120"
                        min={10}
                        className={inputBase}
                      />
                    </div>
                    <div className="flex-1">
                      <label className="mb-1 block text-xs font-medium text-zinc-500">
                        Max attempts
                      </label>
                      <input
                        type="number"
                        disabled={readOnly}
                        value={q.max_attempts}
                        onChange={(e) =>
                          patchQuestion(q.id, { max_attempts: Math.max(1, Number(e.target.value)) })
                        }
                        min={1}
                        className={inputBase}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </SortableItem>
          ))}
        </SortableContext>
      </DndContext>

      {questions.length === 0 && (
        <p className="text-sm text-zinc-500 italic">No assessment questions yet.</p>
      )}

      {!readOnly && (
        <button
          type="button"
          onClick={addQuestion}
          className="flex items-center gap-1.5 rounded-md border border-dashed border-zinc-300 px-3 py-2 text-sm text-zinc-500 transition-colors hover:border-zinc-400 hover:text-zinc-700 dark:border-zinc-700 dark:hover:border-zinc-500 dark:hover:text-zinc-300"
        >
          <Plus className="h-4 w-4" />
          Add question
        </button>
      )}
    </div>
  );
}
