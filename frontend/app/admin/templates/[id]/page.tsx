import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { backendFetch, BackendError } from "@/lib/api";
import type { TemplateOut } from "@/types/api";
import { TemplateEditor } from "@/components/admin/template-editor";

export default async function EditTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const readOnly = session?.user?.role !== "admin";

  let template: TemplateOut;
  try {
    template = await backendFetch<TemplateOut>(`/templates/${id}`);
  } catch (e) {
    if (e instanceof BackendError && e.status === 404) notFound();
    throw e;
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <TemplateEditor template={template} readOnly={readOnly} />
    </div>
  );
}
