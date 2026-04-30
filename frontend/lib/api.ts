/**
 * BFF helper. Use this from server components and route handlers to call the
 * FastAPI backend with the authenticated user's session JWT.
 *
 * Example:
 *   const me = await backendFetch<MeResponse>("/me");
 */
import { auth } from "@/auth";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

export class BackendError extends Error {
  constructor(public status: number, public body: string) {
    super(`backend ${status}: ${body}`);
  }
}

type FetchOptions = Omit<RequestInit, "headers"> & {
  headers?: Record<string, string>;
  /** Bypass auth header injection (e.g. for unauthenticated public-portal calls). */
  unauthenticated?: boolean;
};

export async function backendFetch<T>(
  path: string,
  options: FetchOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers ?? {}),
  };

  if (!options.unauthenticated) {
    const session = await auth();
    if (!session?.backendToken) {
      throw new BackendError(401, "no session token");
    }
    headers["Authorization"] = `Bearer ${session.backendToken}`;
  }

  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers,
    cache: "no-store",
  });

  if (!res.ok) {
    throw new BackendError(res.status, await res.text());
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
