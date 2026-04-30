"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import Lenis from "lenis";

/**
 * `/admin`: no Lenis (native scroll + lighter RAF).
 * Elsewhere: Lenis stays mounted for programmatic/resize sync, but `smoothWheel: false` keeps
 * the **mouse wheel** on the browser’s native scroll path — smoothed wheel deltas often stop
 * short of the real document end so users must grab the scrollbar.
 */
export function LenisProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname.startsWith("/admin")) {
      return undefined;
    }

    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      touchMultiplier: 2,
      smoothWheel: false,
    });

    let rafId = 0;
    let alive = true;

    function tick(time: number) {
      if (!alive) return;
      lenis.raf(time);
      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);

    return () => {
      alive = false;
      cancelAnimationFrame(rafId);
      lenis.destroy();
    };
  }, [pathname]);

  return <>{children}</>;
}
