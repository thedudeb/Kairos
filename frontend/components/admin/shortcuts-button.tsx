"use client";

import { useEffect, useRef } from "react";

export function ShortcutsButton() {
  const btnRef = useRef<HTMLButtonElement>(null);

  // Clicking the button fires the same "?" keydown the global hook listens for.
  function handleClick() {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "?", bubbles: true }));
  }

  return (
    <button
      ref={btnRef}
      onClick={handleClick}
      title="Keyboard shortcuts"
      className="hidden rounded px-1.5 py-0.5 font-mono text-xs text-zinc-400 ring-1 ring-zinc-200 transition-colors hover:text-zinc-600 dark:ring-zinc-700 dark:hover:text-zinc-300 sm:block"
      aria-label="Show keyboard shortcuts"
    >
      ?
    </button>
  );
}
