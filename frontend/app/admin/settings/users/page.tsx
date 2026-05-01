import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { backendFetch, BackendError } from "@/lib/api";
import type { InviteOut, StaffUserOut } from "@/types/api";
import { TeamSettingsClient } from "./team-settings-client";

export default async function TeamSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");
  if (session.user.role !== "admin") redirect("/admin");

  let users: StaffUserOut[] = [];
  let invites: InviteOut[] = [];
  let loadError: string | null = null;

  try {
    [users, invites] = await Promise.all([
      backendFetch<StaffUserOut[]>("/users"),
      backendFetch<InviteOut[]>("/users/invites/pending"),
    ]);
  } catch (e) {
    loadError = e instanceof BackendError ? `${e.status}: ${e.body}` : String(e);
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <Link
        href="/admin"
        className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
      >
        ← Jobs
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Team</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Invite colleagues by email and assign admin or reviewer access.
      </p>

      {loadError ? (
        <div className="mt-8 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
          Could not load team data: <span className="font-mono text-xs">{loadError}</span>
        </div>
      ) : (
        <div className="mt-8">
          <TeamSettingsClient users={users} invites={invites} />
        </div>
      )}
    </div>
  );
}
