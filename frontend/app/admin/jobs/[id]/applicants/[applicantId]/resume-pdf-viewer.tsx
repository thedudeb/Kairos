"use client";

import { Component, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  FileX,
  Loader2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Document, Page, pdfjs } from "react-pdf";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

/** Serve the worker from /public so we never depend on an external CDN. */
function configureWorker() {
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
}

// ─── Error boundary ────────────────────────────────────────────────────────────
// react-pdf's Document can throw after a 404 (worker gets destroyed then
// getStructTree is called on null), which would crash React hydration. This
// boundary catches any render-time throw from the PDF viewer and shows a
// graceful fallback instead of taking down the whole page.
interface EBState { hasError: boolean }
class PdfErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  state: EBState = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(err: Error) { console.error("[pdf-viewer] caught render error:", err); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-zinc-400">
          <FileX className="h-8 w-8" />
          <p className="text-sm">Resume could not be displayed.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────
interface ResumePdfViewerProps {
  jobId: string;
  applicantId: string;
}

export function ResumePdfViewer({ jobId, applicantId }: ResumePdfViewerProps) {
  const fileUrl = useMemo(
    () => `/api/jobs/${jobId}/applicants/${applicantId}/resume`,
    [jobId, applicantId],
  );

  const [configured, setConfigured] = useState(false);
  useEffect(() => {
    configureWorker();
    const id = requestAnimationFrame(() => setConfigured(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const [pageCount, setPageCount] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1.05);
  const [error, setError] = useState<string | null>(null);

  const onLoadSuccess = useCallback((doc: { numPages: number }) => {
    setPageCount(doc.numPages);
    setPage(1);
    setError(null);
  }, []);

  const onLoadError = useCallback((err: Error) => {
    console.error("[pdf-viewer] load error:", err);
    setError("Resume is not available for this applicant.");
  }, []);

  if (!configured) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed border-zinc-200 bg-zinc-50 py-16 dark:border-zinc-700 dark:bg-zinc-900/40">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  // Show friendly message instead of broken viewer when PDF fails to load.
  // (onLoadError fires for 404s; the PdfErrorBoundary catches any worker
  // crashes from missing/corrupt files, so this is layered defense.)
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-200 bg-zinc-50 py-12 text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900/40">
        <FileX className="h-7 w-7" />
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900/60">
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous page"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded p-1.5 text-zinc-600 hover:bg-zinc-200 disabled:opacity-30 dark:hover:bg-zinc-800"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[7rem] text-center text-xs tabular-nums text-zinc-600 dark:text-zinc-400">
            {pageCount ? `${page} / ${pageCount}` : "…"}
          </span>
          <button
            type="button"
            aria-label="Next page"
            disabled={pageCount !== null && page >= pageCount}
            onClick={() =>
              setPage((p) =>
                pageCount !== null ? Math.min(pageCount, p + 1) : p + 1,
              )
            }
            className="rounded p-1.5 text-zinc-600 hover:bg-zinc-200 disabled:opacity-30 dark:hover:bg-zinc-800"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => setScale((s) => Math.max(0.65, Math.round((s - 0.1) * 100) / 100))}
            className="rounded p-1.5 text-zinc-600 hover:bg-zinc-200 dark:hover:bg-zinc-800"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="w-12 text-center text-xs tabular-nums text-zinc-500">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => setScale((s) => Math.min(2, Math.round((s + 0.1) * 100) / 100))}
            className="rounded p-1.5 text-zinc-600 hover:bg-zinc-200 dark:hover:bg-zinc-800"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Viewer — wrapped in error boundary so a worker crash can't kill the page */}
      <PdfErrorBoundary>
        <div className="max-h-[min(720px,70vh)] overflow-auto rounded-lg border border-zinc-200 bg-zinc-100/80 dark:border-zinc-700 dark:bg-zinc-950">
          <Document
            file={fileUrl}
            options={{ disableRange: true, disableStream: true }}
            loading={
              <div className="flex justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
              </div>
            }
            onLoadSuccess={onLoadSuccess}
            onLoadError={onLoadError}
            className="flex justify-center py-4"
          >
            <Page
              pageNumber={page}
              scale={scale}
              className="shadow-lg [&_.react-pdf__Page__canvas]:mx-auto"
              renderTextLayer
              renderAnnotationLayer
            />
          </Document>
        </div>
      </PdfErrorBoundary>
    </div>
  );
}
