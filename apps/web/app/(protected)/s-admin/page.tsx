"use client";
import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AccessDenied } from "@/components/auth-guards";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import type { DbUser } from "@/lib/supabase";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const roleConfig: Record<DbUser["role"], { label: string; className: string }> = {
  superadmin: { label: "Superadmin", className: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-800/60" },
  admin:      { label: "Admin",      className: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800/60" },
  member:     { label: "Member",     className: "bg-muted text-muted-foreground border-border" },
};

export default function SuperAdminPage() {
  const session = useAuth();
  const [users, setUsers] = useState<DbUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((d) => { if (d.error) setError(d.error); else setUsers(d.users); })
      .catch(() => setError("Failed to load users"))
      .finally(() => setLoading(false));
  }, []);

  if (session.role !== "superadmin") {
    return <AccessDenied message="This page is restricted to superadmins." />;
  }

  return (
    <div className="p-8">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-xl font-semibold">Users</h1>
        <p className="text-muted-foreground text-sm mt-1">All users who have signed in to bq-write.</p>
      </div>

      {/* Loading */}
      {loading && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="p-4 border-b border-border bg-muted/30">
            <Skeleton className="h-4 w-48" />
          </div>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3.5 border-b border-border/50 last:border-0">
              <Skeleton className="w-8 h-8 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4">
          <p className="text-destructive text-sm">{error}</p>
        </div>
      )}

      {/* Users table */}
      {!loading && !error && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/30">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{users.length} {users.length === 1 ? "user" : "users"}</span>
          </div>
          <div className="divide-y divide-border/50">
            {users.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">No users yet.</p>
            )}
            {users.map((user) => {
              const cfg = roleConfig[user.role];
              const initials = user.name
                ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
                : user.email[0]?.toUpperCase() ?? "?";
              return (
                <div key={user.id} className="flex items-center gap-4 px-4 py-3.5 hover:bg-muted/20 transition-colors">
                  {/* Avatar */}
                  <div className="w-8 h-8 rounded-full bg-muted border border-border flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-medium text-foreground">{initials}</span>
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{user.name ?? <span className="text-muted-foreground">—</span>}</p>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  </div>
                  {/* Role */}
                  <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md text-xs border font-medium", cfg.className)}>
                    {cfg.label}
                  </span>
                  {/* Dates */}
                  <div className="hidden lg:flex flex-col items-end text-xs text-muted-foreground gap-0.5 flex-shrink-0 min-w-[120px]">
                    <span>Joined {formatDate(user.created_at)}</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Last login: {user.last_login_at ? formatDate(user.last_login_at) : "Never"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
