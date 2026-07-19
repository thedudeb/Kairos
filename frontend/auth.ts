import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";

import { syncBackendIdentity } from "@/lib/backend-auth";

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY ?? "";
const DEMO_ENABLED = process.env.DEMO_ENABLED === "true";

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: process.env.AUTH_TRUST_HOST === "true" || process.env.VERCEL === "1",
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
    ...(DEMO_ENABLED ? [Credentials({
      name: "Demo",
      credentials: {},
      async authorize() {
        try {
          const data = await syncBackendIdentity("demo@kairos.app", "Demo User", null);
          if (!data) return null;
          return {
            id: data.user.id,
            email: data.user.email,
            name: data.user.name ?? "Demo User",
            backendId: data.user.id,
            role: data.user.role,
          };
        } catch (err) {
          console.error("[auth] syncWithBackend threw during demo authorize:", err);
          return null;
        }
      },
    })] : []),
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
        const data = await syncBackendIdentity(user.email, user.name, user.image);
        if (!data) {
          console.error("[auth] user-sync failed during sign-in");
          return false;
        }
        user.backendId = data.user.id;
        user.role = data.user.role;
        return true;
      } catch (err) {
        console.error("[auth] syncWithBackend threw during sign-in:", err);
        return false;
      }
    },

    async jwt({ token, user }) {
      // Store only non-secret identity metadata in the browser session JWT.
      if (user) {
        token.backendId = user.backendId;
        token.role = user.role;
        return token;
      }
      return token;
    },

    async session({ session, token }) {
      if (typeof token.backendId === "string") session.user.id = token.backendId;
      if (typeof token.role === "string") {
        session.user.role = token.role as "admin" | "reviewer";
      }
      return session;
    },
  },
});
