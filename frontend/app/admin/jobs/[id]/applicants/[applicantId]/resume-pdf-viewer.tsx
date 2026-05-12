"use client";

/**
 * Resume PDF viewer.
 *
 * Renders an embedded PDF using the browser's native viewer via an <iframe>.
 *
 * Previously this component used react-pdf + pdfjs-dist with a custom toolbar.
 * That approach kept hitting persistent worker-version mismatch crashes in
 * production: the bundled pdfjs API code would call into a destroyed
 * messageHandler (sendWithPromise on null) once the worker rejected an
 * unexpected message, leaving the viewer permanently broken even after
 * Document.load() succeeded. Switching to <iframe> eliminates the worker
 * entirely — browsers ship their own reliable PDF renderer and toolbar.
 *
 * The proxy route at /api/jobs/[jobId]/applicants/[applicantId]/resume
 * authenticates the request and streams PDF bytes with Content-Type:
 * application/pdf and Content-Disposition: inline, so the iframe renders
 * inline rather than triggering a download.
 */

import { useMemo, useState } from "react";
import { FileX, Loader2 } from "lucide-react";

interface ResumePdfViewerProps {
  jobId: string;
  applicantId: string;
}

export function ResumePdfViewer({ jobId, applicantId }: ResumePdfViewerProps) {
  const fileUrl = useMemo(
    () => `/api/jobs/${jobId}/applicants/${applicantId}/resume`,
    [jobId, applicantId],
  );

  // PDF Open Parameters (Adobe spec, honoured by Chrome / Edge / Firefox's
  // built-in viewers). `navpanes=0` hides the left thumbnail sidebar so we
  // get more horizontal space for the actual resume — most resumes are 1-2
  // pages and the sidebar is just empty real estate. The fragment is purely
  // a client-side hint to the PDF viewer; it never reaches the server.
  const iframeUrl = `${fileUrl}#navpanes=0`;

  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");

  if (state === "error") {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-200 bg-zinc-50 py-12 text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900/40">
        <FileX className="h-7 w-7" />
        <p className="text-sm">Resume is not available for this applicant.</p>
      </div>
    );
  }

  return (
    <div className="relative h-[min(720px,70vh)] overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100/80 dark:border-zinc-700 dark:bg-zinc-950">
      {state === "loading" && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-zinc-50/80 dark:bg-zinc-900/40">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
        </div>
      )}
      <iframe
        src={iframeUrl}
        title="Applicant resume"
        className="h-full w-full"
        onLoad={() => setState("loaded")}
        onError={() => setState("error")}
      />
    </div>
  );
}
