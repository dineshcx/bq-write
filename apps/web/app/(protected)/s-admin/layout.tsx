"use client";
import { AdminSidebar } from "@/components/layout/admin-sidebar";
import { AccessDenied } from "@/components/auth-guards";
import { useAuth } from "@/lib/auth-context";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = useAuth();

  if (!["admin", "superadmin"].includes(session.role)) {
    return <AccessDenied message="This area is restricted to admins." />;
  }

  return (
    <div className="min-h-screen flex">
      <AdminSidebar />
      <main className="flex-1 ml-60 min-h-screen">
        {children}
      </main>
    </div>
  );
}
