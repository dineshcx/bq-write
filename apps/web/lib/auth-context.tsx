"use client";
import { createContext, useContext } from "react";
import { useSession } from "next-auth/react";
import type { Session } from "next-auth";
import { LoadingScreen } from "@/components/auth-guards";

const AuthContext = createContext<Session>(null!);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();

  if (status === "loading") return <LoadingScreen />;
  if (!session) return null;

  return <AuthContext.Provider value={session}>{children}</AuthContext.Provider>;
}

export function useAuth(): Session {
  return useContext(AuthContext);
}
