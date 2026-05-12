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

/** Blur the focused element if it's an input/textarea, so subsequent
 *  global shortcuts (which correctly ignore typing contexts) can fire again.
 *  This is the fix for "shortcuts stopped working after I pressed /":
 *  pressing Esc inside the search returns focus to the page body. */
function blurIfTyping(): void {
  const active = document.activeElement;
  if (
    active instanceof HTMLElement &&
    (active.tagName === "INPUT" ||
      active.tagName === "TEXTAREA" ||
      active.isContentEditable)
  ) {
    active.blur();
  }
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

      // ── Always-on: Esc from anywhere ────────────────────────────────────
      // Closes help, clears any pending chord, and blurs the search input.
      // This is the global "reset the keyboard state" hatch — important
      // because without it, a user who pressed / to focus search and then
      // typed in it has no obvious way to "exit" so other shortcuts work
      // again. Pressing Esc now does the right thing from anywhere.
      if (e.key === "Escape") {
        let did = false;
        if (helpOpenRef.current) {
          setHelpOpen(false);
          did = true;
        }
        if (gChordAtRef.current !== 0) {
          gChordAtRef.current = 0;
          did = true;
        }
        if (typing) {
          blurIfTyping();
          did = true;
        }
        if (did) e.preventDefault();
        return;
      }

      // ── Help dialog open: only `?` toggles it back closed ───────────────
      if (helpOpenRef.current) {
        if (isQuestionMarkHelp(e)) {
          e.preventDefault();
          setHelpOpen(false);
        }
        return;
      }

      // ── `?` toggles help ────────────────────────────────────────────────
      if (isQuestionMarkHelp(e)) {
        if (typing) return;
        e.preventDefault();
        setHelpOpen((o) => !o);
        return;
      }

      // ── `/` focuses applicant search (if present on this page) ──────────
      if (isPlainSlash(e)) {
        if (typing) return;
        e.preventDefault();
        const el = document.getElementById(SEARCH_INPUT_ID);
        if (el instanceof HTMLInputElement) {
          el.focus();
          el.select();
        }
        return;
      }

      // After this point we never act while typing.
      if (typing) return;

      const now = Date.now();
      const withinG = now - gChordAtRef.current < G_CHORD_MS;

      // ── `g` start of a navigation chord ─────────────────────────────────
      if (e.code === "KeyG" && !e.repeat) {
        gChordAtRef.current = now;
        return;
      }

      // ── `g <key>` completions ───────────────────────────────────────────
      if (withinG) {
        // Reset chord state immediately on any second keypress; we either
        // route or fall through, but we never want to leave the chord armed.
        gChordAtRef.current = 0;

        // Navigation: extract jobId if we're inside a job workspace.
        const jobMatch = pathnameRef.current.match(/^\/admin\/jobs\/([^/]+)/);
        const jobId = jobMatch?.[1];

        switch (e.code) {
          case "KeyD": // dashboard
            e.preventDefault();
            routerRef.current.push("/admin");
            return;
          case "KeyL": // applicant list
            if (jobId) {
              e.preventDefault();
              routerRef.current.push(`/admin/jobs/${jobId}/applicants`);
            }
            return;
          case "KeyP": // pipeline
            if (jobId) {
              e.preventDefault();
              routerRef.current.push(`/admin/jobs/${jobId}/pipeline`);
            }
            return;
          case "KeyO": // overview
            if (jobId) {
              e.preventDefault();
              routerRef.current.push(`/admin/jobs/${jobId}`);
            }
            return;
          case "KeyS": // settings
            if (jobId) {
              e.preventDefault();
              routerRef.current.push(`/admin/jobs/${jobId}/settings`);
            }
            return;
          case "KeyI": // integrations
            if (jobId) {
              e.preventDefault();
              routerRef.current.push(`/admin/jobs/${jobId}/integrations`);
            }
            return;
          case "KeyT": // templates
            e.preventDefault();
            routerRef.current.push("/admin/templates");
            return;
          default:
            // Unknown completion — the chord is already cleared above so
            // nothing's stuck. Let the keypress fall through (it does
            // nothing else since we're not in a typing context).
            return;
        }
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
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-xl border border-zinc-200 bg-white p-5 text-sm shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
        data-keyboard-shortcuts-ignore
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">Keyboard shortcuts</h2>
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
          <ShortcutRow keys={["?"]} desc="Toggle this help" />
          <ShortcutRow keys={["/"]} desc="Focus applicant search (when list is visible)" />
          <ShortcutRow keys={["Esc"]} desc="Close help / blur input / cancel chord" />
        </ul>

        <p className="mt-4 mb-2 text-xs font-medium uppercase tracking-wider text-zinc-400">
          Navigation (press <kbd className={kbdCls}>g</kbd> then…)
        </p>
        <ul className="space-y-2.5 text-zinc-600 dark:text-zinc-400">
          <ShortcutRow chord="g" keys={["d"]} desc="Jobs dashboard" />
          <ShortcutRow chord="g" keys={["t"]} desc="Templates" />
          <ShortcutRow chord="g" keys={["o"]} desc="Job overview (inside a job)" />
          <ShortcutRow chord="g" keys={["l"]} desc="Applicant list (inside a job)" />
          <ShortcutRow chord="g" keys={["p"]} desc="Pipeline / Kanban (inside a job)" />
          <ShortcutRow chord="g" keys={["s"]} desc="Job settings (inside a job)" />
          <ShortcutRow chord="g" keys={["i"]} desc="Integrations (inside a job)" />
        </ul>

        <p className="mt-4 text-xs text-zinc-400">Click outside or press ? again to close.</p>
      </div>
    </div>
  ) : null;
}

const kbdCls =
  "rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-xs dark:border-zinc-600 dark:bg-zinc-800";

function ShortcutRow({
  keys,
  desc,
  chord,
}: {
  keys: string[];
  desc: string;
  chord?: string;
}) {
  return (
    <li className="flex items-baseline gap-2">
      <span className="inline-flex shrink-0 items-baseline gap-1 whitespace-nowrap">
        {chord && (
          <>
            <kbd className={kbdCls}>{chord}</kbd>
            <span className="text-zinc-400">then</span>
          </>
        )}
        {keys.map((k, i) => (
          <kbd key={i} className={kbdCls}>
            {k}
          </kbd>
        ))}
      </span>
      <span>{desc}</span>
    </li>
  );
}

export { SEARCH_INPUT_ID };
