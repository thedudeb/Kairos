"use server";

import { BACKEND_URL } from "@/lib/constants";

export interface SubmitResult {
  ok: true;
  applicantId: string;
  message: string;
}

export interface SubmitError {
  ok: false;
  status: number;
  message: string;
}

export type SubmitApplicationResult = SubmitResult | SubmitError;

export async function submitApplication(
  slug: string,
  formData: FormData,
): Promise<SubmitApplicationResult> {
  try {
    const res = await fetch(`${BACKEND_URL}/public/jobs/${slug}/apply`, {
      method: "POST",
      body: formData,
      // Do NOT set Content-Type — fetch sets it automatically with the correct
      // multipart boundary when the body is a FormData instance.
    });

    if (res.ok) {
      const data = await res.json();
      return {
        ok: true,
        applicantId: data.id,
        message: data.message,
      };
    }

    // Surface backend error messages directly (they're user-safe)
    let message = "Something went wrong. Please try again.";
    try {
      const err = await res.json();
      if (typeof err.detail === "string") message = err.detail;
    } catch {}

    return { ok: false, status: res.status, message };
  } catch {
    return {
      ok: false,
      status: 0,
      message: "Could not reach the server. Check your connection and try again.",
    };
  }
}
