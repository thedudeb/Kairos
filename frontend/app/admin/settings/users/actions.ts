"use server";

import { revalidatePath } from "next/cache";
import { backendFetch, BackendError } from "@/lib/api";
import type { InviteOut, StaffRole, StaffUserOut } from "@/types/api";

export async function inviteStaffUser(
  email: string,
  role: StaffRole,
): Promise<{ ok: true; invite: InviteOut } | { ok: false; error: string }> {
  try {
    const invite = await backendFetch<InviteOut>("/users/invites", {
      method: "POST",
      body: JSON.stringify({ email: email.trim(), role }),
    });
    revalidatePath("/admin/settings/users");
    return { ok: true, invite };
  } catch (e) {
    return { ok: false, error: e instanceof BackendError ? e.body : String(e) };
  }
}

export async function revokeInvite(
  inviteId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await backendFetch(`/users/invites/${inviteId}`, { method: "DELETE" });
    revalidatePath("/admin/settings/users");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof BackendError ? e.body : String(e) };
  }
}

export async function patchUserRole(
  userId: string,
  role: StaffRole,
): Promise<{ ok: true; user: StaffUserOut } | { ok: false; error: string }> {
  try {
    const user = await backendFetch<StaffUserOut>(`/users/${userId}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    });
    revalidatePath("/admin/settings/users");
    return { ok: true, user };
  } catch (e) {
    return { ok: false, error: e instanceof BackendError ? e.body : String(e) };
  }
}
