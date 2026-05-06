/**
 * Copies the pdf.js worker shipped with the installed pdfjs-dist into /public,
 * so the worker we serve at /pdf.worker.min.mjs always matches the API version
 * react-pdf imports. A version skew between the two crashes Page rendering with
 * cryptic "sendWithPromise on null" errors after Document loads.
 *
 * Runs on `postinstall` (keeps local devs in sync) and at the start of `build`
 * (keeps Vercel deploys in sync). Idempotent and silent on success.
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const src = resolve(root, "node_modules/pdfjs-dist/build/pdf.worker.min.mjs");
const dst = resolve(root, "public/pdf.worker.min.mjs");

if (!existsSync(src)) {
  // pdfjs-dist not installed yet (e.g. running before npm install on a fresh
  // clone). Skip silently — the build script will run install first anyway.
  process.exit(0);
}

mkdirSync(dirname(dst), { recursive: true });
copyFileSync(src, dst);
console.log("[sync-pdf-worker] synced pdf.worker.min.mjs to /public");
