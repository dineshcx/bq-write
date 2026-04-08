"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

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
    <div className="min-h-screen">
      <header className="border-b border-zinc-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/apps" className="font-semibold text-sm hover:text-zinc-300 transition-colors">bq-write</Link>
          <span className="text-zinc-600">/</span>
          <Link href="/s-admin" className="text-zinc-400 text-sm hover:text-zinc-200">Admin</Link>
          <span className="text-zinc-600">/</span>
          <Link href="/s-admin/apps" className="text-zinc-400 text-sm hover:text-zinc-200">Apps</Link>
          <span className="text-zinc-600">/</span>
          <span className="text-zinc-400 text-sm">New</span>
        </div>
      </header>

      <main className="px-6 py-8 max-w-lg mx-auto">
        <h1 className="text-lg font-semibold mb-6">Create app</h1>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-400 uppercase tracking-wider">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My App"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-zinc-400 uppercase tracking-wider">
              Description <span className="text-zinc-600 normal-case">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this app?"
              rows={3}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors resize-none"
            />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleCreate}
              disabled={!name.trim() || saving}
              className="bg-zinc-100 text-zinc-900 font-medium text-sm px-4 py-2 rounded-lg hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? "Creating..." : "Create app"}
            </button>
            <Link
              href="/s-admin/apps"
              className="text-zinc-400 text-sm px-4 py-2 hover:text-zinc-200 transition-colors"
            >
              Cancel
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

