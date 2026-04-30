import Link from "next/link";
import { notFound } from "next/navigation";
import { backendFetch, BackendError } from "@/lib/api";
import type { TemplateOut } from "@/types/api";
import { ApplicationFormPreview } from "@/components/admin/application-form-preview";
import { AssessmentQuestionsPreview } from "@/components/admin/assessment-questions-preview";

export default async function TemplateFullPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let template: TemplateOut;
  try {
    template = await backendFetch<TemplateOut>(`/templates/${id}`);
  } catch (e) {
    if (e instanceof BackendError && e.status === 404) notFound();
    throw e;
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-4 px-6">
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Careers — template preview
          </span>
          <Link
            href={`/admin/templates/${id}`}
            className="text-sm font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
          >
            ← Edit template
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <ApplicationFormPreview
          heading={template.name || "Untitled template"}
          adminDescription={template.description}
          formFields={template.form_fields}
        />

        <section className="mt-14 border-t border-zinc-200 pt-10 dark:border-zinc-800">
          <h3 className="mb-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Assessment questions
          </h3>
          <p className="mb-6 text-sm text-zinc-500">
            Shown for reference — these are typically sent to external systems when an applicant
            reaches an integrated pipeline stage (not on the public apply form).
          </p>
          <AssessmentQuestionsPreview questions={template.assessment_questions} />
        </section>
      </main>
    </div>
  );
}
