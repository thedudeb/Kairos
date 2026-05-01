import Link from "next/link";
import { auth } from "@/auth";
import { SignOutButton } from "@/components/sign-out-button";
import { HelpButton } from "@/components/admin/help-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { AdminKeyboardShortcuts } from "@/components/admin/admin-keyboard-shortcuts";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/admin" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 shadow-sm shadow-indigo-500/30">
              <svg width="13" height="13" viewBox="0 0 18 18" fill="none">
                <path
                  d="M9 2L9 9M9 9L14 6M9 9L4 6M9 9L14 12M9 9L4 12M9 9L9 16"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <span className="text-sm font-semibold tracking-tight">Kairos</span>
          </Link>
          <div className="flex items-center gap-3">
            {session?.user?.role === "admin" && (
              <Link
                href="/admin/settings/users"
                className="hidden text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 sm:inline"
              >
                Team
              </Link>
            )}
            {session?.user && (
              <span className="hidden items-center gap-2 sm:inline-flex">
                <span className="max-w-[160px] truncate text-sm text-zinc-600 dark:text-zinc-400 lg:max-w-xs">
                  {session.user.email}
                </span>
                <span className="inline-flex items-center rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  {session.user.role}
                </span>
              </span>
            )}
            <ThemeToggle />
            <HelpButton />
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <AdminKeyboardShortcuts />
    </div>
  );
}
