import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { TemplateEditor } from "@/components/admin/template-editor";

export default async function NewTemplatePage() {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    redirect("/admin/templates");
  }
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <TemplateEditor />
    </div>
  );
}
