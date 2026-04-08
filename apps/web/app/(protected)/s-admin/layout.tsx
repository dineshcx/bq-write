"use client";
import { AccessDenied } from "@/components/auth-guards";
import { useAuth } from "@/lib/auth-context";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = useAuth();

  if (!["admin", "superadmin"].includes(session.role)) {
    return <AccessDenied message="This area is restricted to admins." />;
  }

  return <>{children}</>;
}
