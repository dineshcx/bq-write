"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Database, Plus, ChevronRight, Calendar } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { DbApp } from "@/lib/supabase";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function AdminAppsPage() {
  const [apps, setApps] = useState<DbApp[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/apps")
      .then((r) => r.json())
      .then((d) => setApps(d.apps ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-8">
      {/* Page header */}
      <div className="flex items-start justify-between mb-8 gap-4">
        <div>
          <h1 className="text-xl font-semibold">Apps</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage apps, entity files, datasets, and members.
          </p>
        </div>
        <Link
          href="/s-admin/apps/new"
          className="flex items-center gap-2 bg-foreground text-background text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90 transition-opacity flex-shrink-0"
        >
          <Plus className="w-4 h-4" />
          New app
        </Link>
      </div>

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-5 space-y-3">
              <div className="flex items-start gap-3">
                <Skeleton className="w-8 h-8 rounded-lg" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && apps.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-12 h-12 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center mb-4">
            <Database className="w-6 h-6 text-zinc-500" />
          </div>
          <h3 className="text-sm font-medium mb-1">No apps yet</h3>
          <p className="text-xs text-muted-foreground mb-4">Create your first app to get started.</p>
          <Link
            href="/s-admin/apps/new"
            className="flex items-center gap-2 bg-foreground text-background text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" />
            Create first app
          </Link>
        </div>
      )}

      {/* App grid */}
      {!loading && apps.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {apps.map((app) => (
            <Link
              key={app.id}
              href={`/s-admin/apps/${app.id}`}
              className="group rounded-xl border border-border bg-card p-5 hover:border-zinc-600 hover:bg-card/80 transition-all space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center flex-shrink-0 group-hover:border-zinc-600 transition-colors">
                  <Database className="w-4 h-4 text-zinc-400" />
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all mt-1 flex-shrink-0" />
              </div>
              <div>
                <p className="font-medium text-sm group-hover:text-foreground transition-colors">{app.name}</p>
                {app.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{app.description}</p>
                )}
              </div>
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground/60">
                <Calendar className="w-3 h-3" />
                <span>Created {formatDate(app.created_at)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
