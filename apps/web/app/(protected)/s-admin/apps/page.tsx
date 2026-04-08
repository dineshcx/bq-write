"use client";
import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { DbApp } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";

export default function AdminAppsPage() {
  const session = useAuth();
  const [apps, setApps] = useState<DbApp[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/apps")
      .then((r) => r.json())
      .then((d) => setApps(d.apps ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/apps" className="font-semibold text-sm hover:text-zinc-300 transition-colors">bq-write</Link>
          <span className="text-zinc-600">/</span>
          <Link href="/s-admin" className="text-zinc-400 text-sm hover:text-zinc-200">Admin</Link>
          <span className="text-zinc-600">/</span>
          <span className="text-zinc-400 text-sm">Apps</span>
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
        <span className="px-3 py-2.5 text-sm text-zinc-200 border-b-2 border-zinc-200">Apps</span>
        <Link href="/s-admin" className="px-3 py-2.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors">Users</Link>
      </nav>

      <main className="px-6 py-8 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-semibold">Apps</h1>
            <p className="text-zinc-400 text-sm mt-0.5">Manage apps and their entity files, datasets, and members.</p>
          </div>
          <Link
            href="/s-admin/apps/new"
            className="bg-zinc-100 text-zinc-900 text-sm font-medium px-4 py-2 rounded-lg hover:bg-white transition-colors"
          >
            New app
          </Link>
        </div>

        {loading && <p className="text-zinc-500 text-sm">Loading...</p>}

        {!loading && apps.length === 0 && (
          <div className="rounded-lg border border-zinc-800 p-8 text-center">
            <p className="text-zinc-500 text-sm">No apps yet.</p>
            <Link href="/s-admin/apps/new" className="text-zinc-300 text-sm hover:underline mt-2 inline-block">
              Create your first app
            </Link>
          </div>
        )}

        {!loading && apps.length > 0 && (
          <div className="space-y-2">
            {apps.map((app) => (
              <Link
                key={app.id}
                href={`/s-admin/apps/${app.id}`}
                className="flex items-center justify-between rounded-lg border border-zinc-800 px-4 py-3 hover:border-zinc-700 hover:bg-zinc-900/30 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-zinc-200">{app.name}</p>
                  {app.description && (
                    <p className="text-xs text-zinc-500 mt-0.5">{app.description}</p>
                  )}
                </div>
                <span className="text-zinc-600 text-xs">
                  {new Date(app.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

