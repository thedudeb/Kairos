"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Check, X, Loader2, Plus, Trash2 } from "lucide-react";
import { correctParsedResume, type EducationPatch, type WorkPatch } from "../actions";
import type { ParsedResumeOut } from "@/types/api";

interface ResumeEditorProps {
  jobId: string;
  applicantId: string;
  parsed: ParsedResumeOut;
  readOnly?: boolean;
}

const blankEducation = (): EducationPatch => ({
  institution: "",
  degree: "",
  field_of_study: "",
  start_year: null,
  end_year: null,
});

const blankWork = (): WorkPatch => ({
  company: "",
  title: "",
  start_date: "",
  end_date: "",
  description: "",
});

export function ResumeEditor({ jobId, applicantId, parsed, readOnly = false }: ResumeEditorProps) {
  if (readOnly) return null;
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const [fullName, setFullName] = useState(parsed.full_name ?? "");
  const [email, setEmail] = useState(parsed.email ?? "");
  const [phone, setPhone] = useState(parsed.phone ?? "");
  const [topInstitution, setTopInstitution] = useState(parsed.top_institution ?? "");
  const [topDegree, setTopDegree] = useState(parsed.top_degree ?? "");
  const [skills, setSkills] = useState<string[]>(
    parsed.skills.map((s) => s.skill),
  );
  const [newSkill, setNewSkill] = useState("");

  const [education, setEducation] = useState<EducationPatch[]>(
    parsed.education.map((e) => ({
      institution: e.institution ?? "",
      degree: e.degree ?? "",
      field_of_study: e.field_of_study ?? "",
      start_year: e.start_year,
      end_year: e.end_year,
    })),
  );
  const [work, setWork] = useState<WorkPatch[]>(
    parsed.work.map((w) => ({
      company: w.company ?? "",
      title: w.title ?? "",
      start_date: w.start_date ?? "",
      end_date: w.end_date ?? "",
      description: w.description ?? "",
    })),
  );

  function handleCancel() {
    setFullName(parsed.full_name ?? "");
    setEmail(parsed.email ?? "");
    setPhone(parsed.phone ?? "");
    setTopInstitution(parsed.top_institution ?? "");
    setTopDegree(parsed.top_degree ?? "");
    setSkills(parsed.skills.map((s) => s.skill));
    setEducation(
      parsed.education.map((e) => ({
        institution: e.institution ?? "",
        degree: e.degree ?? "",
        field_of_study: e.field_of_study ?? "",
        start_year: e.start_year,
        end_year: e.end_year,
      })),
    );
    setWork(
      parsed.work.map((w) => ({
        company: w.company ?? "",
        title: w.title ?? "",
        start_date: w.start_date ?? "",
        end_date: w.end_date ?? "",
        description: w.description ?? "",
      })),
    );
    setNewSkill("");
    setError(null);
    setEditing(false);
  }

  function addSkill() {
    const s = newSkill.trim();
    if (!s || skills.some((x) => x.toLowerCase() === s.toLowerCase())) return;
    setSkills((prev) => [...prev, s]);
    setNewSkill("");
  }

  function removeSkill(idx: number) {
    setSkills((prev) => prev.filter((_, i) => i !== idx));
  }

  function patchEdu(idx: number, partial: Partial<EducationPatch>) {
    setEducation((prev) => prev.map((e, i) => (i === idx ? { ...e, ...partial } : e)));
  }

  function patchWork(idx: number, partial: Partial<WorkPatch>) {
    setWork((prev) => prev.map((w, i) => (i === idx ? { ...w, ...partial } : w)));
  }

  async function save() {
    setError(null);
    startTransition(async () => {
      const result = await correctParsedResume(jobId, applicantId, {
        full_name: fullName || null,
        email: email || null,
        phone: phone || null,
        top_institution: topInstitution || null,
        top_degree: topDegree || null,
        skills,
        education: education.map((e) => ({
          institution: e.institution?.trim() || null,
          degree: e.degree?.trim() || null,
          field_of_study: e.field_of_study?.trim() || null,
          start_year: e.start_year || null,
          end_year: e.end_year || null,
        })),
        work: work.map((w) => ({
          company: w.company?.trim() || null,
          title: w.title?.trim() || null,
          start_date: w.start_date?.trim() || null,
          end_date: w.end_date?.trim() || null,
          description: w.description?.trim() || null,
        })),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700 dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        <Pencil className="h-3 w-3" />
        Edit
      </button>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-900/10">
      <p className="mb-4 text-xs font-semibold text-amber-700 dark:text-amber-400">
        Manual correction mode — edits override AI-extracted data
      </p>

      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Full name" value={fullName} onChange={setFullName} />
        <Field label="Email" value={email} onChange={setEmail} type="email" />
        <Field label="Phone" value={phone} onChange={setPhone} />
        <Field label="Top institution" value={topInstitution} onChange={setTopInstitution} />
        <Field label="Top degree" value={topDegree} onChange={setTopDegree} />
      </div>

      {/* Skills editor */}
      <div className="mt-3">
        <label className="mb-1.5 block text-xs font-semibold text-zinc-500">Skills</label>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {skills.map((s, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded-full bg-zinc-200 px-2 py-0.5 text-xs dark:bg-zinc-700"
            >
              {s}
              <button onClick={() => removeSkill(i)} className="text-zinc-400 hover:text-red-500">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={newSkill}
            onChange={(e) => setNewSkill(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSkill(); } }}
            placeholder="Add skill…"
            className="flex-1 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
          <button
            onClick={addSkill}
            className="rounded-md border border-zinc-200 p-1.5 text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Education editor */}
      <div className="mt-4 border-t border-amber-200/60 pt-4 dark:border-amber-900/40">
        <div className="mb-2 flex items-center justify-between">
          <label className="text-xs font-semibold text-zinc-500">Education</label>
          <button
            type="button"
            onClick={() => setEducation((prev) => [...prev, blankEducation()])}
            className="inline-flex items-center gap-1 rounded-md border border-zinc-200 px-2 py-0.5 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            <Plus className="h-3 w-3" /> Add
          </button>
        </div>
        <div className="space-y-2">
          {education.length === 0 && (
            <p className="text-xs italic text-zinc-400">No education entries.</p>
          )}
          {education.map((edu, i) => (
            <div
              key={i}
              className="rounded-md border border-zinc-200 bg-white p-2.5 dark:border-zinc-700 dark:bg-zinc-800/40"
            >
              <div className="mb-2 flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => setEducation((prev) => prev.filter((_, j) => j !== i))}
                  className="text-zinc-400 hover:text-red-500"
                  aria-label="Remove entry"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Institution" value={edu.institution ?? ""} onChange={(v) => patchEdu(i, { institution: v })} />
                <Field label="Degree" value={edu.degree ?? ""} onChange={(v) => patchEdu(i, { degree: v })} />
                <Field label="Field of study" value={edu.field_of_study ?? ""} onChange={(v) => patchEdu(i, { field_of_study: v })} />
                <div className="grid grid-cols-2 gap-2">
                  <Field
                    label="Start year"
                    value={edu.start_year?.toString() ?? ""}
                    onChange={(v) => patchEdu(i, { start_year: v ? parseInt(v, 10) || null : null })}
                  />
                  <Field
                    label="End year"
                    value={edu.end_year?.toString() ?? ""}
                    onChange={(v) => patchEdu(i, { end_year: v ? parseInt(v, 10) || null : null })}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Work editor */}
      <div className="mt-4 border-t border-amber-200/60 pt-4 dark:border-amber-900/40">
        <div className="mb-2 flex items-center justify-between">
          <label className="text-xs font-semibold text-zinc-500">Work experience</label>
          <button
            type="button"
            onClick={() => setWork((prev) => [...prev, blankWork()])}
            className="inline-flex items-center gap-1 rounded-md border border-zinc-200 px-2 py-0.5 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            <Plus className="h-3 w-3" /> Add
          </button>
        </div>
        <div className="space-y-2">
          {work.length === 0 && (
            <p className="text-xs italic text-zinc-400">No work entries.</p>
          )}
          {work.map((w, i) => (
            <div
              key={i}
              className="rounded-md border border-zinc-200 bg-white p-2.5 dark:border-zinc-700 dark:bg-zinc-800/40"
            >
              <div className="mb-2 flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => setWork((prev) => prev.filter((_, j) => j !== i))}
                  className="text-zinc-400 hover:text-red-500"
                  aria-label="Remove entry"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Company" value={w.company ?? ""} onChange={(v) => patchWork(i, { company: v })} />
                <Field label="Title" value={w.title ?? ""} onChange={(v) => patchWork(i, { title: v })} />
                <Field label="Start (YYYY or YYYY-MM)" value={w.start_date ?? ""} onChange={(v) => patchWork(i, { start_date: v })} />
                <Field label="End (YYYY, YYYY-MM, or 'present')" value={w.end_date ?? ""} onChange={(v) => patchWork(i, { end_date: v })} />
              </div>
              <div className="mt-2">
                <label className="mb-1 block text-xs font-semibold text-zinc-500">Description</label>
                <textarea
                  value={w.description ?? ""}
                  onChange={(e) => patchWork(i, { description: e.target.value })}
                  rows={2}
                  className="w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          onClick={save}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          Save corrections
        </button>
        <button
          onClick={handleCancel}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700"
        >
          <X className="h-3 w-3" />
          Cancel
        </button>
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-zinc-500">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
      />
    </div>
  );
}
