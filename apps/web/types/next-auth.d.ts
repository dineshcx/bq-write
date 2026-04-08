import "next-auth";
import "next-auth/jwt";
import type { UserRole } from "../lib/supabase";

declare module "next-auth" {
  interface Session {
    accessToken: string;
    role: UserRole;
    error?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken: string;
    refreshToken?: string;
    accessTokenExpires?: number;
    role?: UserRole;
    error?: string;
  }
}
