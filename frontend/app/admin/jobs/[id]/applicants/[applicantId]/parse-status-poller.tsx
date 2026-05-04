"use client";

/**
 * Invisible client component that auto-refreshes the page every 4 seconds
 * while the applicant's parse_status is "pending" or "parsing".
 * Once the status changes the server will render a different value and this
 * component will unmount (or render null if the status is already terminal).
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

interface ParseStatusPollerProps {
  parseStatus: string;
}

export function ParseStatusPoller({ parseStatus }: ParseStatusPollerProps) {
  const router = useRouter();
  const shouldPoll = parseStatus === "pending" || parseStatus === "parsing";

  useEffect(() => {
    if (!shouldPoll) return;
    const interval = setInterval(() => {
      router.refresh();
    }, 4000);
    return () => clearInterval(interval);
  }, [shouldPoll, router]);

  return null;
}
