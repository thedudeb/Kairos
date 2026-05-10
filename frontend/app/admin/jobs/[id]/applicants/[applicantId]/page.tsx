import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { ArrowLeft, ExternalLink, FileText, RefreshCw, GraduationCap, Briefcase, Mail, Phone, Clock } from "lucide-react";
import { backendFetch } from "@/lib/api";
import { getCachedJob } from "../../job-data";
import type { ApplicantDetail, PipelineStage } from "@/types/api";
import { ParseStatusBadge } from "../parse-status-badge";
import { StageMover } from "./stage-mover";
import { NotesSection } from "./notes-section";
import { ReparseButton } from "./reparse-button";
import { ResumeEditor } from "./resume-editor";
import { ResumePdfViewer } from "./resume-pdf-viewer";
import { ApplicantAvatar } from "@/components/applicant-avatar";
import { FitScoreCard } from "./fit-score-card";
import { ParseStatusPoller } from "./parse-status-poller";

async function fetchApplicant(jobId: string, applicantId: string): Promise<ApplicantDetail | null> {
  try {
    return await backendFetch<ApplicantDetail>(`/jobs/${jobId}/applicants/${applicantId}`);
  } catch { return null; }
}

async function fetchStages(jobId: string): Promise<PipelineStage[]> {
  try {
    return await backendFetch<PipelineStage[]>(`/jobs/${jobId}/pipeline-stages`);
  } catch { return []; }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function formatShortDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

const SKILL_COLORS = [
  "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  "bg-sky-100    text-sky-700    dark:bg-sky-900/30    dark:text-sky-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  "bg-amber-100  text-amber-700  dark:bg-amber-900/30  dark:text-amber-300",
];

function skillColor(skill: string): string {
  let h = 0;
  for (let i = 0; i < skill.length; i++) h = (h * 31 + skill.charCodeAt(i)) & 0x7fffffff;
  return SKILL_COLORS[h % SKILL_COLORS.length];
}

export default async function ApplicantDetailPage({
  params,
}: {
  params: Promise<{ id: string; applicantId: string }>;
}) {
  const { id: jobId, applicantId } = await params;

  const [applicant, stages, job] = await Promise.all([
    fetchApplicant(jobId, applicantId),
    fetchStages(jobId),
    getCachedJob(jobId).catch(() => null),
  ]);

  if (!applicant) notFound();

  const session = await auth();
  const isAdmin = session?.user?.role === "admin";

  const pr = applicant.parsed_resume;

  return (
    <>
    <ParseStatusPoller parseStatus={applicant.parse_status} />
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">

      {/* ── Top bar ── */}
      <div className="border-b border-zinc-200 bg-white px-4 py-4 sm:px-6 sm:py-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto max-w-6xl">
          <Link
            href={`/admin/jobs/${jobId}/applicants`}
            className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            <ArrowLeft className="h-4 w-4" />
            All applicants
          </Link>

          <div className="flex flex-wrap items-start justify-between gap-4">
            {/* Identity */}
            <div className="flex items-center gap-4">
              <ApplicantAvatar
                firstName={applicant.first_name}
                lastName={applicant.last_name}
                size="lg"
              />
              <div>
                <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                  {applicant.first_name} {applicant.last_name}
                </h1>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-500">
                  <span className="inline-flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" />
                    {applicant.email}
                  </span>
                  {applicant.phone && (
                    <span className="inline-flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5" />
                      {applicant.phone}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    Applied {formatDate(applicant.submitted_at)}
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <ParseStatusBadge status={applicant.parse_status} />
              {applicant.resume_url && (
                <a
                  href={`/api/jobs/${jobId}/applicants/${applicantId}/resume`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                >
                  <FileText className="h-4 w-4" />
                  Resume
                  <ExternalLink className="h-3 w-3 text-zinc-400" />
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="grid gap-6 lg:grid-cols-3">

          {/* ── Left: resume PDF + parsed profile + custom fields ── */}
          <div className="order-2 space-y-6 lg:order-1 lg:col-span-2">

            {/* Original resume */}
            {applicant.resume_url && (
              <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Original resume</h2>
                  <a
                    href={`/api/jobs/${jobId}/applicants/${applicantId}/resume`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                  >
                    Open in new tab <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <ResumePdfViewer jobId={jobId} applicantId={applicantId} />
              </section>
            )}

            {/* Resume intelligence */}
            <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Resume intelligence</h2>
                <div className="flex items-center gap-2">
                  {pr && (
                    <ResumeEditor jobId={jobId} applicantId={applicantId} parsed={pr} readOnly={!isAdmin} />
                  )}
                  <ReparseButton
                    jobId={jobId}
                    applicantId={applicantId}
                    parseStatus={applicant.parse_status}
                    readOnly={!isAdmin}
                  />
                </div>
              </div>

              {applicant.parse_status === "pending" && (
                <p className="text-sm text-zinc-400">Resume parsing will begin shortly.</p>
              )}
              {applicant.parse_status === "parsing" && (
                <div className="flex items-center gap-2 text-sm text-indigo-600 dark:text-indigo-400">
                  <RefreshCw className="h-4 w-4 animate-spin" /> Parsing resume…
                </div>
              )}
              {applicant.parse_status === "failed" && (
                <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
                  Parsing failed.{applicant.parse_error && <span className="ml-1 text-xs">{applicant.parse_error}</span>}
                </div>
              )}
              {applicant.parse_status === "needs_manual" && (
                <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                  Automatic parsing was inconclusive. Use <strong>Edit</strong> to fill in fields manually, or <strong>Re-parse</strong> to try again.
                </div>
              )}

              {pr && (
                <div className="space-y-7">

                  {/* Confidence banner — surface AI's "I wasn't sure about X" notes upfront */}
                  {pr.confidence_notes && Object.keys(pr.confidence_notes).length > 0 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/15 dark:text-amber-300">
                      <p className="mb-1 font-semibold">AI parser flagged {Object.keys(pr.confidence_notes).length} field{Object.keys(pr.confidence_notes).length === 1 ? "" : "s"} with low confidence.</p>
                      <ul className="space-y-0.5 pl-4 [list-style-type:disc]">
                        {Object.entries(pr.confidence_notes).map(([k, v]) => (
                          <li key={k}>
                            <span className="font-mono">{k}</span>: {String(v)}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-1.5 italic">Use Edit to correct manually, or check the original resume.</p>
                    </div>
                  )}

                  {/* Skills — coloured chips */}
                  {pr.skills.length > 0 && (
                    <div>
                      <SectionLabel>Skills</SectionLabel>
                      <div className="flex flex-wrap gap-1.5">
                        {pr.skills.map((s) => (
                          <span
                            key={s.id}
                            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${skillColor(s.skill)}`}
                          >
                            {s.skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Education timeline */}
                  {pr.education.length > 0 && (
                    <div>
                      <SectionLabel icon={<GraduationCap className="h-3.5 w-3.5" />}>Education</SectionLabel>
                      <div className="space-y-0">
                        {pr.education.map((edu, i) => (
                          <div key={edu.id} className="flex gap-4">
                            <div className="flex flex-col items-center">
                              <div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-indigo-500 ring-2 ring-indigo-100 dark:ring-indigo-900/50" />
                              {i < pr.education.length - 1 && (
                                <div className="mt-1 w-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
                              )}
                            </div>
                            <div className="pb-5">
                              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                                {edu.institution ?? "Unknown institution"}
                              </p>
                              {(edu.degree || edu.field_of_study) && (
                                <p className="text-sm text-zinc-500">
                                  {[edu.degree, edu.field_of_study].filter(Boolean).join(" · ")}
                                </p>
                              )}
                              {(edu.start_year || edu.end_year) && (
                                <p className="mt-0.5 text-xs text-zinc-400">
                                  {edu.start_year ?? ""}{edu.end_year ? ` – ${edu.end_year}` : ""}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Work experience timeline */}
                  {pr.work.length > 0 && (
                    <div>
                      <SectionLabel icon={<Briefcase className="h-3.5 w-3.5" />}>Work experience</SectionLabel>
                      <div className="space-y-0">
                        {pr.work.map((w, i) => (
                          <div key={w.id} className="flex gap-4">
                            <div className="flex flex-col items-center">
                              <div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-violet-500 ring-2 ring-violet-100 dark:ring-violet-900/50" />
                              {i < pr.work.length - 1 && (
                                <div className="mt-1 w-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
                              )}
                            </div>
                            <div className="pb-5">
                              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                                  {w.title ?? "Unknown role"}
                                </p>
                                {(w.start_date || w.end_date) && (
                                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800">
                                    {w.start_date ?? ""}{w.end_date ? ` – ${w.end_date}` : ""}
                                  </span>
                                )}
                              </div>
                              {w.company && <p className="text-sm text-zinc-500">{w.company}</p>}
                              {w.description && (
                                <p className="mt-1 text-xs leading-relaxed text-zinc-400">{w.description}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Parsed contact cross-reference */}
                  <div>
                    <SectionLabel>Parsed contact info</SectionLabel>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <InfoItem label="Full name" value={pr.full_name} note={note(pr.confidence_notes, "full_name")} />
                      <InfoItem label="Email"     value={pr.email}     note={note(pr.confidence_notes, "email")} />
                      <InfoItem label="Phone"     value={pr.phone}     note={note(pr.confidence_notes, "phone")} />
                    </div>
                  </div>

                </div>
              )}
            </section>

            {/* Custom field responses */}
            {applicant.custom_fields.length > 0 && (
              <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
                <h2 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Application responses</h2>
                <div className="space-y-4">
                  {applicant.custom_fields.map((f) => (
                    <div key={f.id}>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-400">{f.field_label}</p>
                      {f.value_file_url ? (
                        <a
                          href={f.value_file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:underline dark:text-indigo-400"
                        >
                          <FileText className="h-4 w-4" /> View file <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <p className="text-sm text-zinc-700 dark:text-zinc-300">
                          {f.value_text ?? <span className="text-zinc-300 dark:text-zinc-600">—</span>}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* ── Right: fit + stage + notes + activity ── */}
          <div className="order-1 space-y-5 lg:order-2">

            <FitScoreCard
              jobId={jobId}
              applicantId={applicantId}
              fit={applicant.fit_score_detail}
              isAdmin={isAdmin}
            />

            <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                Pipeline stage
              </h2>
              <StageMover
                jobId={jobId}
                applicantId={applicantId}
                applicantName={`${applicant.first_name} ${applicant.last_name}`.trim()}
                applicantEmail={applicant.email}
                jobTitle={job?.title ?? ""}
                stages={stages}
                currentStageId={applicant.current_stage_id}
                readOnly={!isAdmin}
              />
            </section>

            <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                Notes
              </h2>
              <NotesSection
                jobId={jobId}
                applicantId={applicantId}
                existingNotes={applicant.notes}
                readOnly={!isAdmin}
              />
            </section>

            <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                Activity
              </h2>
              {applicant.activity.length === 0 ? (
                <p className="text-sm text-zinc-400 dark:text-zinc-500">No activity yet.</p>
              ) : (
                <ol className="relative space-y-4 border-l border-zinc-200 pl-5 dark:border-zinc-700">
                  {applicant.activity.map((event) => (
                    <li key={event.id} className="relative">
                      <div className="absolute -left-[21px] top-1 h-3 w-3 rounded-full border-2 border-white bg-zinc-300 dark:border-zinc-900 dark:bg-zinc-600" />
                      <p className="text-sm text-zinc-700 dark:text-zinc-300">{event.detail}</p>
                      <p className="mt-0.5 text-xs text-zinc-400">
                        {event.actor_name && <span className="font-medium">{event.actor_name} · </span>}
                        {formatShortDate(event.timestamp)}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>

        </div>
      </div>
    </div>
    </>
  );
}

function SectionLabel({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
      {icon}{children}
    </h3>
  );
}

function InfoItem({
  label,
  value,
  note,
}: {
  label: string;
  value: string | null | undefined;
  note?: string | null;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">{label}</p>
      <p className="mt-0.5 text-sm text-zinc-800 dark:text-zinc-200">
        {value ?? <span className="text-zinc-300 dark:text-zinc-600">—</span>}
      </p>
      {note && (
        <p
          className="mt-1 inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/20 dark:text-amber-400"
          title="AI parser flagged low confidence on this field"
        >
          <span aria-hidden>!</span>
          {note}
        </p>
      )}
    </div>
  );
}

/** Pull a string note for a given field key out of confidence_notes. */
function note(notes: Record<string, unknown> | null | undefined, key: string): string | null {
  if (!notes) return null;
  const v = notes[key];
  return typeof v === "string" && v.trim() ? v : null;
}
