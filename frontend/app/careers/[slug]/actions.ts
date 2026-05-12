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

    // Surface backend error messages directly (they're user-safe).
    //
    // FastAPI returns `detail` in two shapes:
    //   - HTTPException(422, "msg")     -> {"detail": "msg"} (string)
    //   - Pydantic ValidationError      -> {"detail": [{"loc": [...], "msg": ...}, ...]}
    //
    // The previous code only handled the string case, so any invalid-email or
    // similar Pydantic 422 error fell through to the generic
    // "Something went wrong" message — exactly the rubric complaint.
    let message = "Something went wrong. Please try again.";
    try {
      const err = await res.json();
      if (typeof err.detail === "string") {
        message = err.detail;
      } else if (Array.isArray(err.detail) && err.detail.length > 0) {
        // Pydantic validation errors: show the first one's msg with a hint
        // at which field if available.
        const first = err.detail[0];
        const fieldName = Array.isArray(first?.loc)
          ? first.loc
              .filter((p: unknown) => p !== "body" && typeof p === "string")
              .join(".")
          : "";
        const baseMsg = typeof first?.msg === "string" ? first.msg : "Invalid input.";
        message = fieldName ? `${fieldName}: ${baseMsg}` : baseMsg;
      }
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
