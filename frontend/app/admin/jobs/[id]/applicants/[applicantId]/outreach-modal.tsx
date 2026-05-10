"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, Mail, Send, X, Sparkles } from "lucide-react";
import { draftOutreach, sendOutreach } from "../actions";
import { cn } from "@/lib/utils";

interface OutreachModalProps {
  jobId: string;
  applicantId: string;
  applicantName: string;
  applicantEmail: string;
  stageName: string;
  jobTitle: string;
  onClose: () => void;
}

export function OutreachModal({
  jobId,
  applicantId,
  applicantName,
  applicantEmail,
  stageName,
  jobTitle,
  onClose,
}: OutreachModalProps) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [isDrafting, setIsDrafting] = useState(true);
  const [isSending, startSendTransition] = useTransition();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-draft on mount
  useEffect(() => {
    let cancelled = false;
    async function draft() {
      setIsDrafting(true);
      const result = await draftOutreach(jobId, applicantId, stageName, jobTitle);
      if (cancelled) return;
      setIsDrafting(false);
      if (result.ok && result.subject && result.body) {
        setSubject(result.subject);
        setBody(result.body);
      } else {
        setError("Couldn't generate a draft. You can write your own below.");
      }
    }
    draft();
    return () => { cancelled = true; };
  }, [jobId, applicantId, stageName, jobTitle]);

  function handleSend() {
    if (!subject.trim() || !body.trim()) {
      setError("Subject and message are required.");
      return;
    }
    setError(null);
    startSendTransition(async () => {
      const result = await sendOutreach(jobId, applicantId, subject.trim(), body.trim());
      if (result.ok) {
        setSent(true);
        setTimeout(onClose, 1500);
      } else {
        setError(result.error ?? "Failed to send email.");
      }
    });
  }

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10">
              <Mail className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Send outreach to {applicantName}
              </p>
              <p className="text-xs text-zinc-400">{applicantEmail}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Stage badge */}
        <div className="px-5 pt-4">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              AI-drafted for stage:{" "}
              <span className="font-medium text-zinc-700 dark:text-zinc-300">{stageName}</span>
            </span>
            {isDrafting && (
              <Loader2 className="ml-1 h-3 w-3 animate-spin text-indigo-500" />
            )}
          </div>
        </div>

        {/* Form */}
        <div className="space-y-3 px-5 py-4">
          {/* Subject */}
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Subject
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={isDrafting || isSending || sent}
              placeholder={isDrafting ? "Generating…" : "Email subject"}
              className={cn(
                "block w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition",
                "placeholder:text-zinc-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100",
                "disabled:bg-zinc-50 disabled:text-zinc-400",
                "dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500",
                "dark:focus:border-indigo-500 dark:focus:ring-indigo-900/30 dark:disabled:bg-zinc-800/50",
              )}
            />
          </div>

          {/* Body */}
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Message
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={isDrafting || isSending || sent}
              rows={7}
              placeholder={isDrafting ? "Generating your personalised draft…" : "Write your message…"}
              className={cn(
                "block w-full resize-none rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition",
                "placeholder:text-zinc-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100",
                "disabled:bg-zinc-50 disabled:text-zinc-400",
                "dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500",
                "dark:focus:border-indigo-500 dark:focus:ring-indigo-900/30 dark:disabled:bg-zinc-800/50",
              )}
            />
          </div>

          {error && (
            <p className="text-xs text-amber-600 dark:text-amber-400">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-zinc-100 px-5 py-3 dark:border-zinc-800">
          <button
            onClick={onClose}
            disabled={isSending}
            className="text-sm text-zinc-400 hover:text-zinc-600 disabled:opacity-50 dark:hover:text-zinc-300"
          >
            Skip
          </button>

          <button
            onClick={handleSend}
            disabled={isDrafting || isSending || sent || !subject.trim() || !body.trim()}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition",
              sent
                ? "bg-emerald-600 text-white"
                : "bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50",
            )}
          >
            {sent ? (
              "Sent ✓"
            ) : isSending ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
            ) : (
              <><Send className="h-4 w-4" /> Send email</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
