import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";

import { BACKEND_URL } from "@/lib/constants";
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY ?? "";

// How many ms before expiry to proactively refresh the backend token (1 day).
const REFRESH_BUFFER_MS = 24 * 60 * 60 * 1000;

async function syncWithBackend(email: string, name?: string | null, imageUrl?: string | null) {
  const res = await fetch(`${BACKEND_URL}/internal/auth/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-API-Key": INTERNAL_API_KEY,
    },
    body: JSON.stringify({ email, name, image_url: imageUrl }),
  });
  if (!res.ok) return null;
  return res.json() as Promise<{
    user: { id: string; email: string; name: string | null; role: "admin" | "reviewer" };
    session_token: string;
  }>;
}

console.log("[auth] ENV CHECK", {
  hasGoogleId: !!process.env.AUTH_GOOGLE_ID,
  googleIdLength: process.env.AUTH_GOOGLE_ID?.length,
  hasGoogleSecret: !!process.env.AUTH_GOOGLE_SECRET,
  hasSecret: !!process.env.AUTH_SECRET,
  authUrl: process.env.AUTH_URL,
  trustHost: process.env.AUTH_TRUST_HOST,
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
    Credentials({
      name: "Demo",
      credentials: {},
      async authorize() {
        try {
          const data = await syncWithBackend("demo@kairos.app", "Demo User", null);
          if (!data) return null;
          return {
            id: data.user.id,
            email: data.user.email,
            name: data.user.name ?? "Demo User",
            backendId: data.user.id,
            role: data.user.role,
            backendToken: data.session_token,
          };
        } catch (err) {
          console.error("[auth] syncWithBackend threw during demo authorize:", err);
          return null;
        }
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/sign-in",
  },
  callbacks: {
    async signIn({ user, account }) {
      // Credentials (demo) provider already synced in authorize().
      if (account?.provider === "credentials") return true;

      if (!user.email) return false;

      if (!INTERNAL_API_KEY) {
        console.error("[auth] INTERNAL_API_KEY is not configured — sign-in disabled");
        return false;
      }

      try {
        const data = await syncWithBackend(user.email, user.name, user.image);
        if (!data) {
          console.error("[auth] user-sync failed during sign-in");
          return false;
        }
        user.backendId = data.user.id;
        user.role = data.user.role;
        user.backendToken = data.session_token;
        return true;
      } catch (err) {
        console.error("[auth] syncWithBackend threw during sign-in:", err);
        return false;
      }
    },

    async jwt({ token, user }) {
      // Fresh sign-in — store token and its expiry.
      if (user) {
        token.backendId = user.backendId;
        token.role = user.role;
        token.backendToken = user.backendToken;
        // Backend issues 7-day tokens; record when this one expires.
        token.backendTokenExpiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
        return token;
      }

      // Subsequent requests — refresh the backend token if it's within the
      // buffer window or already expired, so users never hit a silent 401.
      const expiresAt = token.backendTokenExpiresAt as number | undefined;
      if (expiresAt && Date.now() > expiresAt - REFRESH_BUFFER_MS) {
        const email = token.email as string | undefined;
        if (email && INTERNAL_API_KEY) {
          try {
            const data = await syncWithBackend(email, token.name as string, token.picture as string);
            if (data) {
              token.backendToken = data.session_token;
              token.backendTokenExpiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
            }
          } catch {
            // Keep existing token; it may still have time left.
          }
        }
      }

      return token;
    },

    async session({ session, token }) {
      if (typeof token.backendId === "string") session.user.id = token.backendId;
      if (typeof token.role === "string") {
        session.user.role = token.role as "admin" | "reviewer";
      }
      if (typeof token.backendToken === "string") {
        session.backendToken = token.backendToken;
      }
      return session;
    },
  },
});
