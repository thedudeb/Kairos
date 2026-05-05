import Link from "next/link";
import { auth } from "@/auth";
import { ParticleCanvas } from "@/components/particle-canvas";
import { SignInButton } from "@/components/sign-in-button";
import { DemoButton } from "@/components/demo-button";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await auth();

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#0a0a0f] px-6 text-center">

      {/* Particle network */}
      <ParticleCanvas />

      {/* Background gradient orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-indigo-600/20 blur-[120px]" />
        <div className="absolute bottom-0 left-1/4 h-[400px] w-[400px] -translate-x-1/2 rounded-full bg-violet-600/15 blur-[100px]" />
        <div className="absolute right-1/4 top-1/2 h-[350px] w-[350px] -translate-y-1/2 translate-x-1/2 rounded-full bg-sky-500/10 blur-[100px]" />
      </div>

      {/* Subtle grid overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
        }}
      />

      {/* Content */}
      <main className="relative z-10 flex max-w-2xl flex-col items-center gap-8">

        {/* Logo mark */}
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/30">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M9 2L9 9M9 9L14 6M9 9L4 6M9 9L14 12M9 9L4 12M9 9L9 16" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span className="text-lg font-semibold tracking-tight text-white">Kairos</span>
        </div>

        {/* Headline */}
        <div className="space-y-4">
          <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
            Hire the right person,{" "}
            <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-sky-400 bg-clip-text text-transparent">
              at the right moment.
            </span>
          </h1>
          <p className="mx-auto max-w-lg text-base leading-relaxed text-zinc-400 sm:text-lg">
            AI resume parsing, a configurable Kanban pipeline, and job-scoped
            analytics — all in one place.
          </p>
        </div>

        {/* CTA */}
        {session?.user ? (
          <Link
            href="/admin"
            className="group relative inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition-all hover:shadow-indigo-500/40 hover:scale-[1.02]"
          >
            Open admin dashboard
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="transition-transform group-hover:translate-x-0.5">
              <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>
        ) : (
          <div className="flex w-full max-w-xs flex-col gap-3">
            <SignInButton callbackUrl="/admin" />
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-xs text-zinc-600">or</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>
            <DemoButton callbackUrl="/admin" />
          </div>
        )}

        {/* Feature pills */}
        <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
          {["AI Resume Parsing", "Kanban Pipeline", "Analytics Dashboard", "Webhook Integrations"].map((f) => (
            <span
              key={f}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-zinc-400 backdrop-blur-sm"
            >
              {f}
            </span>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="absolute bottom-6 text-xs text-zinc-600">
        Recruitment Intelligence Platform
      </footer>
    </div>
  );
}
