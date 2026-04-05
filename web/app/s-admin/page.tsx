"use client";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { DbUser } from "@/lib/supabase";

export default function SuperAdminPage() {
  const { data: session, status } = useSession();
  const [users, setUsers] = useState<DbUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;

    fetch("/api/admin/users")
      .then((res) => res.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setUsers(data.users);
      })
      .catch(() => setError("Failed to load users"))
      .finally(() => setLoading(false));
  }, [status]);

  if (status === "loading") {
    return <LoadingScreen />;
  }

  if (!session) {
    return <AccessDenied message="You must be signed in." />;
  }

  if (session.role !== "superadmin") {
    return <AccessDenied message="This page is restricted to superadmins." />;
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/apps" className="font-semibold text-sm hover:text-zinc-300 transition-colors">bq-write</Link>
          <span className="text-zinc-600 text-sm">/</span>
          <span className="text-zinc-400 text-sm">Users</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-zinc-400 text-sm">{session.user?.email}</span>
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      <nav className="border-b border-zinc-800 px-6 flex gap-1">
        <Link href="/s-admin/apps" className="px-3 py-2.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors">Apps</Link>
        <span className="px-3 py-2.5 text-sm text-zinc-200 border-b-2 border-zinc-200">Users</span>
      </nav>

      <main className="px-6 py-8 max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-lg font-semibold">Users</h1>
          <p className="text-zinc-400 text-sm mt-0.5">
            All users who have signed in to bq-write.
          </p>
        </div>

        {loading && (
          <p className="text-zinc-500 text-sm">Loading users...</p>
        )}

        {error && (
          <div className="rounded-lg border border-red-900 bg-red-950/30 p-4">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {!loading && !error && (
          <div className="rounded-lg border border-zinc-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/50">
                  <th className="text-left px-4 py-3 text-xs text-zinc-400 font-medium uppercase tracking-wider">
                    Name
                  </th>
                  <th className="text-left px-4 py-3 text-xs text-zinc-400 font-medium uppercase tracking-wider">
                    Email
                  </th>
                  <th className="text-left px-4 py-3 text-xs text-zinc-400 font-medium uppercase tracking-wider">
                    Role
                  </th>
                  <th className="text-left px-4 py-3 text-xs text-zinc-400 font-medium uppercase tracking-wider">
                    Joined
                  </th>
                  <th className="text-left px-4 py-3 text-xs text-zinc-400 font-medium uppercase tracking-wider">
                    Last login
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-zinc-500 text-sm">
                      No users yet.
                    </td>
                  </tr>
                )}
                {users.map((user) => (
                  <tr
                    key={user.id}
                    className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-900/30 transition-colors"
                  >
                    <td className="px-4 py-3 text-zinc-200">
                      {user.name ?? <span className="text-zinc-600">—</span>}
                    </td>
                    <td className="px-4 py-3 text-zinc-300">{user.email}</td>
                    <td className="px-4 py-3">
                      <RoleBadge role={user.role} />
                    </td>
                    <td className="px-4 py-3 text-zinc-400">
                      {formatDate(user.created_at)}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">
                      {user.last_login_at ? formatDate(user.last_login_at) : <span className="text-zinc-600">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

function RoleBadge({ role }: { role: DbUser["role"] }) {
  const styles: Record<DbUser["role"], string> = {
    superadmin: "bg-purple-950/60 text-purple-300 border-purple-800",
    admin: "bg-blue-950/60 text-blue-300 border-blue-800",
    member: "bg-zinc-800 text-zinc-400 border-zinc-700",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs border font-medium ${styles[role]}`}>
      {role}
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function LoadingScreen() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <span className="text-zinc-500 text-sm">Loading...</span>
    </div>
  );
}

function AccessDenied({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center space-y-2">
        <p className="text-zinc-300 font-medium">Access denied</p>
        <p className="text-zinc-500 text-sm">{message}</p>
      </div>
    </div>
  );
}
