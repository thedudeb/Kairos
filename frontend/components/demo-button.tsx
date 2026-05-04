"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Loader2 } from "lucide-react";

// Only rendered when NEXT_PUBLIC_DEMO_ENABLED=true is set in the environment.
// This prevents the demo bypass from being visible in production deployments.
export function DemoButton({ callbackUrl }: { callbackUrl: string }) {
  const [loading, setLoading] = useState(false);

  if (process.env.NEXT_PUBLIC_DEMO_ENABLED !== "true") return null;

  async function handleClick() {
    setLoading(true);
    await signIn("credentials", { callbackUrl });
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="flex w-full items-center justify-center gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/10 disabled:opacity-50"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <span className="h-4 w-4 text-center text-xs font-bold text-zinc-400">D</span>
      )}
      Try demo
    </button>
  );
}
