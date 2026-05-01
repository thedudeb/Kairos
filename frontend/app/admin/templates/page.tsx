import Link from "next/link";
import { Plus } from "lucide-react";
import { auth } from "@/auth";
import { backendFetch } from "@/lib/api";
import { duplicateTemplate, deleteTemplate } from "@/app/admin/actions";
import type { TemplateSummary } from "@/types/api";

async function doDuplicate(id: string) {
  "use server";
  await duplicateTemplate(id);
}

async function doDelete(id: string) {
  "use server";
  await deleteTemplate(id);
}

export default async function TemplateLibraryPage() {
  const session = await auth();
  const isAdmin = session?.user?.role === "admin";

  const templates = await backendFetch<TemplateSummary[]>("/templates/");

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <Link
            href="/admin"
            className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            ← Jobs
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Templates</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Reusable bundles of custom form fields and assessment questions.
          </p>
        </div>
        {isAdmin && (
          <Link
            href="/admin/templates/new"
            className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            <Plus className="h-4 w-4" />
            New template
          </Link>
        )}
      </div>

      {templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-200 py-20 text-center dark:border-zinc-800">
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">No templates yet</p>
          <p className="mt-1 text-sm text-zinc-500">
            Create a template to reuse form fields and assessment questions across jobs.
          </p>
          {isAdmin ? (
            <Link
              href="/admin/templates/new"
              className="mt-6 inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
            >
              <Plus className="h-4 w-4" />
              New template
            </Link>
          ) : (
            <p className="mt-4 text-xs text-zinc-400">Ask an admin to create templates.</p>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {templates.map((t) => (
            <div
              key={t.id}
              className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="mb-1 flex items-start justify-between gap-2">
                <Link
                  href={`/admin/templates/${t.id}`}
                  className="font-medium text-zinc-900 hover:underline dark:text-zinc-100"
                >
                  {t.name}
                </Link>
              </div>
              {t.description && (
                <p className="mb-3 text-sm text-zinc-500 line-clamp-2">{t.description}</p>
              )}
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/admin/templates/${t.id}`}
                  className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                >
                  {isAdmin ? "Edit" : "View"}
                </Link>
                {isAdmin && (
                  <>
                    <form action={doDuplicate.bind(null, t.id)}>
                      <button
                        type="submit"
                        className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                      >
                        Duplicate
                      </button>
                    </form>
                    <form action={doDelete.bind(null, t.id)}>
                      <button
                        type="submit"
                        className="rounded-md border border-red-100 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-900 dark:bg-zinc-900 dark:text-red-400"
                      >
                        Delete
                      </button>
                    </form>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
