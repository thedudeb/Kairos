import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SignInButton } from "@/components/sign-in-button";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const session = await auth();
  const params = await searchParams;
  // Only allow relative paths starting with "/" to prevent open-redirect attacks.
  // Reject anything starting with "//" (protocol-relative) or containing "://".
  const raw = params.callbackUrl ?? "";
  const callbackUrl =
    raw.startsWith("/") && !raw.startsWith("//") && !raw.includes("://")
      ? raw
      : "/admin";

  if (session?.user) {
    redirect(callbackUrl);
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#0a0a0f] px-6">

      {/* Background gradient orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-indigo-600/20 blur-[120px]" />
        <div className="absolute bottom-0 left-1/4 h-[350px] w-[350px] -translate-x-1/2 rounded-full bg-violet-600/15 blur-[100px]" />
        <div className="absolute right-1/4 top-1/2 h-[300px] w-[300px] -translate-y-1/2 translate-x-1/2 rounded-full bg-sky-500/10 blur-[100px]" />
      </div>

      {/* Subtle grid overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
        }}
      />

      {/* Card */}
      <div className="relative z-10 w-full max-w-sm">
        {/* Logo mark */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/30">
            <svg width="22" height="22" viewBox="0 0 18 18" fill="none">
              <path
                d="M9 2L9 9M9 9L14 6M9 9L4 6M9 9L14 12M9 9L4 12M9 9L9 16"
                stroke="white"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <span className="text-xl font-semibold tracking-tight text-white">Kairos</span>
        </div>

        {/* Glass card */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-sm">
          <div className="mb-6 text-center">
            <h1 className="text-xl font-semibold text-white">Welcome back</h1>
            <p className="mt-1.5 text-sm text-zinc-400">
              Sign in to access the admin dashboard.
            </p>
          </div>

          <SignInButton callbackUrl={callbackUrl} />

          <p className="mt-6 text-center text-xs text-zinc-600">
            Access is restricted to authorised team members.
          </p>
        </div>
      </div>

      {/* Footer */}
      <p className="absolute bottom-6 z-10 text-xs text-zinc-700">
        Recruitment Intelligence Platform
      </p>
    </div>
  );
}
