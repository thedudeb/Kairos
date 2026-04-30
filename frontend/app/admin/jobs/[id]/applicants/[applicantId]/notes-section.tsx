"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send, Pencil, Trash2, Check, X } from "lucide-react";
import type { NoteOut } from "@/types/api";
import { addNote, editNote, deleteNote } from "../actions";

interface NotesSectionProps {
  jobId: string;
  applicantId: string;
  existingNotes: NoteOut[];
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function NoteItem({
  note,
  jobId,
  applicantId,
}: {
  note: NoteOut;
  jobId: string;
  applicantId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(note.body);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSaveEdit() {
    const trimmed = editBody.trim();
    if (!trimmed) return;
    startTransition(async () => {
      const result = await editNote(jobId, applicantId, note.id, trimmed);
      if (result.ok) {
        setEditing(false);
        router.refresh();
      }
    });
  }

  function handleDelete() {
    startTransition(async () => {
      await deleteNote(jobId, applicantId, note.id);
      router.refresh();
    });
  }

  if (editing) {
    return (
      <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800">
        <textarea
          value={editBody}
          onChange={(e) => setEditBody(e.target.value)}
          rows={3}
          disabled={isPending}
          autoFocus
          className="block w-full resize-none rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={handleSaveEdit}
            disabled={!editBody.trim() || isPending}
            className="inline-flex items-center gap-1 rounded-md bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Save
          </button>
          <button
            onClick={() => { setEditing(false); setEditBody(note.body); }}
            className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600"
          >
            <X className="h-3 w-3" /> Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800">
      <p className="text-sm text-zinc-700 dark:text-zinc-300">{note.body}</p>
      <div className="mt-1 flex items-center justify-between">
        <p className="text-xs text-zinc-400">
          <span className="font-medium">{note.author_name}</span> · {formatDate(note.created_at)}
        </p>
        <div className="flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={() => setEditing(true)}
            className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
            title="Edit note"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleDelete}
            disabled={isPending}
            className="text-zinc-400 hover:text-red-500 disabled:opacity-40"
            title="Delete note"
          >
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}

export function NotesSection({ jobId, applicantId, existingNotes }: NotesSectionProps) {
  const [body, setBody] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;

    setError(null);
    startTransition(async () => {
      const result = await addNote(jobId, applicantId, trimmed);
      if (result.ok) {
        setBody("");
        router.refresh();
      } else {
        setError(result.error ?? "Failed to save note");
      }
    });
  }

  return (
    <div className="space-y-3">
      {existingNotes.length > 0 && (
        <div className="space-y-3">
          {existingNotes.map((note) => (
            <NoteItem key={note.id} note={note} jobId={jobId} applicantId={applicantId} />
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a note…"
          rows={3}
          disabled={isPending}
          className="block w-full resize-none rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
        />
        {error && <p className="text-xs text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={!body.trim() || isPending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          Save note
        </button>
      </form>
    </div>
  );
}
