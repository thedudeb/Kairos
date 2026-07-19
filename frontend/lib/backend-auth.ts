import { BACKEND_URL } from "@/lib/constants";

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY ?? "";

export interface BackendIdentity {
  user: {
    id: string;
    email: string;
    name: string | null;
    role: "admin" | "reviewer";
  };
  session_token: string;
}

export async function syncBackendIdentity(
  email: string,
  name?: string | null,
  imageUrl?: string | null,
): Promise<BackendIdentity | null> {
  if (!INTERNAL_API_KEY) return null;
  const res = await fetch(`${BACKEND_URL}/internal/auth/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-API-Key": INTERNAL_API_KEY,
    },
    body: JSON.stringify({ email, name, image_url: imageUrl }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json() as Promise<BackendIdentity>;
}
