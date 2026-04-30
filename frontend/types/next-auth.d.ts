import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "admin" | "reviewer";
    } & DefaultSession["user"];
    backendToken: string;
  }

  interface User {
    backendId?: string;
    role?: "admin" | "reviewer";
    backendToken?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    backendId?: string;
    role?: "admin" | "reviewer";
    backendToken?: string;
  }
}
