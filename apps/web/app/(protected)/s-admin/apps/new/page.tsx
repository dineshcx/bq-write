"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, AlertCircle, Database } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function NewAppPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/apps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      router.push(`/s-admin/apps/${data.app.id}`);
    } catch {
      setError("Failed to create app");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-8">
      <div className="max-w-lg">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center">
            <Database className="w-5 h-5 text-zinc-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Create app</h1>
            <p className="text-muted-foreground text-sm">Set up a new workspace for your team.</p>
          </div>
        </div>

        {/* Form */}
        <div className="rounded-xl border border-border bg-card p-6 space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="app-name">Name</Label>
            <Input
              id="app-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My App"
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="app-desc">
              Description <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <textarea
              id="app-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this app for?"
              rows={3}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors resize-none"
            />
          </div>

          {error && (
            <p className="flex items-center gap-1.5 text-sm text-destructive">
              <AlertCircle className="w-4 h-4" />{error}
            </p>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleCreate}
              disabled={!name.trim() || saving}
              className="flex items-center gap-2 bg-foreground text-background font-medium text-sm px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? "Creating…" : "Create app"}
            </button>
            <Link href="/s-admin/apps" className="text-sm text-muted-foreground hover:text-foreground transition-colors px-2">
              Cancel
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
