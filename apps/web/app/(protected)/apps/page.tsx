"use client";
import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { DbApp } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";

export default function AppsPage() {
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
        <span className="font-semibold text-sm">bq-write</span>
        <div className="flex items-center gap-4">
          {["admin", "superadmin"].includes(session.role) && (
            <Link
              href={session.role === "superadmin" ? "/s-admin" : "/s-admin/apps"}
              className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
            >
              Admin
            </Link>
          )}
          <span className="text-zinc-400 text-sm">{session.user?.email}</span>
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="px-6 py-8 max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-lg font-semibold">Your apps</h1>
          <p className="text-zinc-400 text-sm mt-0.5">Select an app to start querying.</p>
        </div>

        {loading && <p className="text-zinc-500 text-sm">Loading...</p>}

        {!loading && apps.length === 0 && (
          <div className="rounded-lg border border-zinc-800 p-8 text-center">
            <p className="text-zinc-500 text-sm">You have not been added to any apps yet.</p>
            <p className="text-zinc-600 text-xs mt-1">Ask an admin to add you.</p>
          </div>
        )}

        {!loading && apps.length > 0 && (
          <div className="space-y-2">
            {apps.map((app) => (
              <Link
                key={app.id}
                href={`/apps/${app.id}`}
                className="flex items-center justify-between rounded-lg border border-zinc-800 px-4 py-4 hover:border-zinc-700 hover:bg-zinc-900/30 transition-colors group"
              >
                <div>
                  <p className="text-sm font-medium text-zinc-200 group-hover:text-white transition-colors">
                    {app.name}
                  </p>
                  {app.description && (
                    <p className="text-xs text-zinc-500 mt-0.5">{app.description}</p>
                  )}
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-600 group-hover:text-zinc-400 transition-colors">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

