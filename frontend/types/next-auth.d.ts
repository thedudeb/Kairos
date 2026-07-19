import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "admin" | "reviewer";
    } & DefaultSession["user"];
  }

  interface User {
    backendId?: string;
    role?: "admin" | "reviewer";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    backendId?: string;
    role?: "admin" | "reviewer";
  }
}
