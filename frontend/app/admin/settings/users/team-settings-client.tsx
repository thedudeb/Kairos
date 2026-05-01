"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { InviteOut, StaffRole, StaffUserOut } from "@/types/api";
import { inviteStaffUser, patchUserRole, revokeInvite } from "./actions";

interface Props {
  users: StaffUserOut[];
  invites: InviteOut[];
}

export function TeamSettingsClient({ users, invites }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<StaffRole>("reviewer");
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingInvite, startInvite] = useTransition();
  const [rolePendingId, setRolePendingId] = useState<string | null>(null);
  const [revokePendingId, setRevokePendingId] = useState<string | null>(null);

  function onInvite(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    startInvite(async () => {
      const r = await inviteStaffUser(email, inviteRole);
      if (r.ok) {
        setEmail("");
        router.refresh();
      } else {
        setFormError(r.error);
      }
    });
  }

  return (
    <div className="space-y-10">
      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Invite teammate
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          They get the selected role automatically on first Google sign-in with this email.
        </p>
        <form onSubmit={onInvite} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@company.com"
              className="block w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </div>
          <div className="sm:w-40">
            <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Role
            </label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as StaffRole)}
              className="block w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            >
              <option value="reviewer">Reviewer</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={pendingInvite}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {pendingInvite ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Sending…
              </span>
            ) : (
              "Send invite"
            )}
          </button>
        </form>
        {formError && (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">{formError}</p>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Pending invites
        </h2>
        {invites.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">No pending invites.</p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
            {invites.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <span className="font-medium text-zinc-900 dark:text-zinc-100">{inv.email}</span>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs dark:bg-zinc-800">
                  {inv.role}
                </span>
                <span className="text-xs text-zinc-400">
                  {new Date(inv.created_at).toLocaleString()}
                </span>
                <button
                  type="button"
                  disabled={revokePendingId === inv.id}
                  onClick={() => {
                    setRevokePendingId(inv.id);
                    void revokeInvite(inv.id)
                      .then(() => router.refresh())
                      .finally(() => setRevokePendingId(null));
                  }}
                  className="ml-auto text-xs text-red-600 hover:underline disabled:opacity-50"
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Users</h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-100 text-xs uppercase tracking-wider text-zinc-500 dark:border-zinc-800">
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Role</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.id}
                  className="border-b border-zinc-50 last:border-0 dark:border-zinc-800/80"
                >
                  <td className="px-4 py-3 font-mono text-xs text-zinc-800 dark:text-zinc-200">
                    {u.email}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {u.name ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={u.role}
                      disabled={rolePendingId === u.id}
                      onChange={(ev) => {
                        const next = ev.target.value as StaffRole;
                        if (next === u.role) return;
                        setRolePendingId(u.id);
                        void patchUserRole(u.id, next)
                          .then(() => router.refresh())
                          .finally(() => setRolePendingId(null));
                      }}
                      className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-950"
                    >
                      <option value="reviewer">Reviewer</option>
                      <option value="admin">Admin</option>
                    </select>
                    {rolePendingId === u.id && (
                      <Loader2 className="ml-2 inline h-3 w-3 animate-spin text-zinc-400" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
