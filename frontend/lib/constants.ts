/**
 * Shared runtime constants for server-side code.
 *
 * Import BACKEND_URL from here instead of re-declaring
 * `process.env.BACKEND_URL ?? "http://localhost:8000"` in every file.
 */
export const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";
