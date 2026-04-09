"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Database, Search, ChevronRight, LayoutGrid } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { UserNav } from "@/components/layout/user-nav";
import { useAuth } from "@/lib/auth-context";
import type { DbApp } from "@/lib/supabase";

export default function AppsPage() {
  const session = useAuth();
  const [apps, setApps] = useState<DbApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/apps")
      .then((r) => r.json())
      .then((d) => setApps(d.apps ?? []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = apps.filter(
    (app) =>
      app.name.toLowerCase().includes(search.toLowerCase()) ||
      app.description?.toLowerCase().includes(search.toLowerCase())
  );

  const isAdmin = ["admin", "superadmin"].includes(session.role);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-sm px-6 h-14 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-muted border border-border">
            <Database className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
          <span className="font-semibold text-sm">bq-write</span>
        </div>
        <UserNav
          email={session.user?.email}
          name={session.user?.name}
          role={session.role}
          showAdminLink={isAdmin}
        />
      </header>

      {/* Main */}
      <main className="flex-1 px-6 py-10 max-w-4xl mx-auto w-full">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">Workspaces</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Select a workspace to start querying your data.
            </p>
          </div>
          {apps.length > 0 && (
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search workspaces..."
                className="pl-8 h-9 text-sm"
              />
            </div>
          )}
        </div>

        {/* Loading skeletons */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="rounded-xl border border-border p-5 space-y-3">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && apps.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-12 h-12 rounded-xl bg-muted border border-border flex items-center justify-center mb-4">
              <LayoutGrid className="w-6 h-6 text-muted-foreground" />
            </div>
            <h3 className="text-sm font-medium mb-1">No workspaces yet</h3>
            <p className="text-xs text-muted-foreground max-w-xs">
              You haven't been added to any workspaces. Ask an admin to add you.
            </p>
          </div>
        )}

        {/* No search results */}
        {!loading && apps.length > 0 && filtered.length === 0 && (
          <div className="text-center py-12">
            <p className="text-sm text-muted-foreground">No workspaces match &ldquo;{search}&rdquo;</p>
          </div>
        )}

        {/* App grid */}
        {!loading && filtered.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filtered.map((app) => (
              <Link
                key={app.id}
                href={`/apps/${app.id}`}
                className="group rounded-xl border border-border bg-card p-5 hover:border-foreground/20 hover:bg-accent/30 transition-all space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="w-8 h-8 rounded-lg bg-muted border border-border flex items-center justify-center flex-shrink-0 transition-colors">
                    <Database className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all mt-1 flex-shrink-0" />
                </div>
                <div>
                  <p className="font-medium text-sm group-hover:text-foreground transition-colors">{app.name}</p>
                  {app.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{app.description}</p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
