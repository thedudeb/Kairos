"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";

const JOB_ID_RE = /\/admin\/jobs\/([^/]+)/;

function isTypingTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = (el as HTMLElement).tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

const SHORTCUTS = [
  { keys: "?", description: "Show this help" },
  { keys: "g h", description: "Go to admin home" },
  { keys: "g o", description: "Go to job Overview" },
  { keys: "g a", description: "Go to Applicants" },
  { keys: "g p", description: "Go to Pipeline" },
  { keys: "g s", description: "Go to Settings" },
  { keys: "g i", description: "Go to Integrations" },
  { keys: "/", description: "Focus search (applicant list)" },
  { keys: "Esc", description: "Dismiss this panel" },
];

export function KeyboardShortcuts() {
  const router = useRouter();
  const pathname = usePathname();
  const [showHelp, setShowHelp] = useState(false);
  const pendingG = useRef(false);
  const pendingGTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep a ref so the stable listener always reads the current pathname
  // without needing to re-register on every navigation.
  const pathnameRef = useRef(pathname);
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Always dismiss help on Escape.
      if (e.key === "Escape") {
        setShowHelp(false);
        pendingG.current = false;
        return;
      }

      // Don't fire shortcuts when typing in an input.
      if (isTypingTarget(document.activeElement)) return;
      // Don't fire with modifier keys (except Shift for '?').
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const jobMatch = pathnameRef.current.match(JOB_ID_RE);
      const jobId = jobMatch?.[1];

      // Handle pending "g" chord.
      if (pendingG.current) {
        pendingG.current = false;
        if (pendingGTimer.current) clearTimeout(pendingGTimer.current);

        switch (e.key) {
          case "h":
            router.push("/admin");
            break;
          case "o":
            if (jobId) router.push(`/admin/jobs/${jobId}`);
            break;
          case "a":
            if (jobId) router.push(`/admin/jobs/${jobId}/applicants`);
            break;
          case "p":
            if (jobId) router.push(`/admin/jobs/${jobId}/pipeline`);
            break;
          case "s":
            if (jobId) router.push(`/admin/jobs/${jobId}/settings`);
            break;
          case "i":
            if (jobId) router.push(`/admin/jobs/${jobId}/integrations`);
            break;
        }
        return;
      }

      switch (e.key) {
        case "?":
          e.preventDefault();
          setShowHelp((v) => !v);
          break;

        case "g":
          // Start a "g" chord — next key completes the action.
          pendingG.current = true;
          pendingGTimer.current = setTimeout(() => {
            pendingG.current = false;
          }, 1500);
          break;

        case "/": {
          // Focus the search input if one exists on the page.
          const searchInput = document.querySelector<HTMLInputElement>(
            'input[type="search"], input[placeholder*="earch"]',
          );
          if (searchInput) {
            e.preventDefault();
            searchInput.focus();
          }
          break;
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (pendingGTimer.current) clearTimeout(pendingGTimer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Stable listener — pathname is read via pathnameRef, router is stable.

  if (!showHelp) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={() => setShowHelp(false)}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Keyboard shortcuts
          </h2>
          <button
            onClick={() => setShowHelp(false)}
            className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            Esc to close
          </button>
        </div>
        <ul className="space-y-2">
          {SHORTCUTS.map((s) => (
            <li key={s.keys} className="flex items-center justify-between gap-4">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">{s.description}</span>
              <kbd className="inline-flex items-center rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                {s.keys}
              </kbd>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
