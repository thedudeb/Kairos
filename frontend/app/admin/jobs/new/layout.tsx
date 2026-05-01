import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function NewJobLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    redirect("/admin");
  }
  return children;
}
