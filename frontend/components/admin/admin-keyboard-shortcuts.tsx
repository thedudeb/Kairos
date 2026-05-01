"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { X } from "lucide-react";

const SEARCH_INPUT_ID = "kairos-applicant-search";
const G_CHORD_MS = 900;

function isTypingContext(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.closest("[data-keyboard-shortcuts-ignore]")) return true;
  return false;
}

/** Slash key without Shift — works across layouts via `code`. */
function isPlainSlash(e: KeyboardEvent): boolean {
  return e.code === "Slash" && !e.shiftKey;
}

/** `?` (Shift+/) — match both `key` and `code` for picky browsers. */
function isQuestionMarkHelp(e: KeyboardEvent): boolean {
  if (e.metaKey || e.ctrlKey || e.altKey) return false;
  if (e.key === "?") return true;
  return e.code === "Slash" && e.shiftKey;
}

export function AdminKeyboardShortcuts() {
  const router = useRouter();
  const pathname = usePathname();
  const [helpOpen, setHelpOpen] = useState(false);

  const pathnameRef = useRef(pathname);
  const routerRef = useRef(router);
  const helpOpenRef = useRef(helpOpen);
  const gChordAtRef = useRef(0);

  useLayoutEffect(() => {
    pathnameRef.current = pathname;
    routerRef.current = router;
  });

  useLayoutEffect(() => {
    helpOpenRef.current = helpOpen;
  }, [helpOpen]);

  // Single listener for the lifetime of the admin shell — reads only refs (no stale closures).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const target = e.target;
      const typing = isTypingContext(target);

      // Help dialog: Esc / ? close; ignore other shortcuts leaking to the page behind.
      if (helpOpenRef.current) {
        if (e.key === "Escape") {
          e.preventDefault();
          setHelpOpen(false);
          return;
        }
        if (isQuestionMarkHelp(e)) {
          e.preventDefault();
          setHelpOpen(false);
          return;
        }
        return;
      }

      if (isQuestionMarkHelp(e)) {
        if (typing) return;
        e.preventDefault();
        setHelpOpen((o) => !o);
        return;
      }

      if (isPlainSlash(e)) {
        if (typing) return;
        e.preventDefault();
        document.getElementById(SEARCH_INPUT_ID)?.focus();
        return;
      }

      if (typing) return;

      const now = Date.now();
      const withinG = now - gChordAtRef.current < G_CHORD_MS;

      if (e.code === "KeyG" && !e.repeat) {
        gChordAtRef.current = now;
        return;
      }

      if (withinG && e.code === "KeyD") {
        e.preventDefault();
        gChordAtRef.current = 0;
        routerRef.current.push("/admin");
        return;
      }

      if (withinG && e.code === "KeyL") {
        e.preventDefault();
        gChordAtRef.current = 0;
        const m = pathnameRef.current.match(/^\/admin\/jobs\/([^/]+)/);
        if (m) {
          routerRef.current.push(`/admin/jobs/${m[1]}/applicants`);
        }
        return;
      }

      // Any non-d/l key cancels the pending G chord (avoid stuck state).
      if (withinG && e.key.length === 1) {
        gChordAtRef.current = 0;
      }
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  return helpOpen ? (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-end bg-black/20 p-4 sm:items-center sm:justify-center"
      role="dialog"
      aria-label="Keyboard shortcuts"
      aria-modal="true"
      data-keyboard-shortcuts-ignore
      onClick={() => setHelpOpen(false)}
    >
      <div
        className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-xl border border-zinc-200 bg-white p-5 text-sm shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
        data-keyboard-shortcuts-ignore
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">Shortcuts</h2>
          <button
            type="button"
            onClick={() => setHelpOpen(false)}
            className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <ul className="space-y-2.5 text-zinc-600 dark:text-zinc-400">
          <li>
            <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-xs dark:border-zinc-600 dark:bg-zinc-800">
              ?
            </kbd>{" "}
            Toggle this help
          </li>
          <li>
            <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-xs dark:border-zinc-600 dark:bg-zinc-800">
              /
            </kbd>{" "}
            Focus applicant search (when the list is visible)
          </li>
          <li>
            <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-xs dark:border-zinc-600 dark:bg-zinc-800">
              g
            </kbd>{" "}
            then{" "}
            <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-xs dark:border-zinc-600 dark:bg-zinc-800">
              d
            </kbd>{" "}
            — Jobs dashboard
          </li>
          <li>
            <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-xs dark:border-zinc-600 dark:bg-zinc-800">
              g
            </kbd>{" "}
            then{" "}
            <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-xs dark:border-zinc-600 dark:bg-zinc-800">
              l
            </kbd>{" "}
            — Applicant list (inside a job)
          </li>
          <li>
            <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-xs dark:border-zinc-600 dark:bg-zinc-800">
              Esc
            </kbd>{" "}
            Close help
          </li>
        </ul>
        <p className="mt-4 text-xs text-zinc-400">Click outside or press ? again to close.</p>
      </div>
    </div>
  ) : null;
}

export { SEARCH_INPUT_ID };
