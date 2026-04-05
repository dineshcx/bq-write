"use client";
import { useSession, signOut } from "next-auth/react";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import type { DbAppDataset, DbAppFile } from "@/lib/supabase";

interface AppDetail {
  id: string;
  name: string;
  description: string | null;
}

interface Member {
  user_id: string;
  users: { id: string; email: string; name: string | null; role: string };
}

type Tab = "files" | "datasets" | "members";

export default function AdminAppDetailPage({ params }: { params: { id: string } }) {
  const { data: session, status } = useSession();
  const [app, setApp] = useState<AppDetail | null>(null);
  const [datasets, setDatasets] = useState<DbAppDataset[]>([]);
  const [files, setFiles] = useState<DbAppFile[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [tab, setTab] = useState<Tab>("files");
  const [loading, setLoading] = useState(true);

  const reload = () => {
    fetch(`/api/apps/${params.id}`)
      .then((r) => r.json())
      .then((d) => {
        setApp(d.app);
        setDatasets(d.datasets ?? []);
        setFiles(d.files ?? []);
        setMembers(d.members ?? []);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (status !== "authenticated") return;
    reload();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  if (status === "loading" || loading) return <LoadingScreen />;
  if (!session || !["admin", "superadmin"].includes(session.role)) return <AccessDenied />;
  if (!app) return <div className="flex items-center justify-center min-h-screen"><p className="text-zinc-500 text-sm">App not found.</p></div>;

  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/apps" className="font-semibold text-sm hover:text-zinc-300 transition-colors">bq-write</Link>
          <span className="text-zinc-600">/</span>
          <Link href="/s-admin/apps" className="text-zinc-400 text-sm hover:text-zinc-200">Apps</Link>
          <span className="text-zinc-600">/</span>
          <span className="text-zinc-300 text-sm">{app.name}</span>
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

      <main className="px-6 py-8 max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-lg font-semibold">{app.name}</h1>
          {app.description && <p className="text-zinc-400 text-sm mt-0.5">{app.description}</p>}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-zinc-800 mb-6">
          {(["files", "datasets", "members"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm capitalize transition-colors ${
                tab === t
                  ? "text-zinc-100 border-b-2 border-zinc-100 -mb-px"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {t}
              {t === "files" && files.length > 0 && (
                <span className="ml-1.5 text-xs text-zinc-600">({files.length})</span>
              )}
              {t === "datasets" && datasets.length > 0 && (
                <span className="ml-1.5 text-xs text-zinc-600">({datasets.length})</span>
              )}
              {t === "members" && members.length > 0 && (
                <span className="ml-1.5 text-xs text-zinc-600">({members.length})</span>
              )}
            </button>
          ))}
        </div>

        {tab === "files" && (
          <FilesTab appId={params.id} files={files} onReload={reload} />
        )}
        {tab === "datasets" && (
          <DatasetsTab appId={params.id} datasets={datasets} onReload={reload} />
        )}
        {tab === "members" && (
          <MembersTab appId={params.id} members={members} onReload={reload} />
        )}
      </main>
    </div>
  );
}

// ─── Files Tab ────────────────────────────────────────────────────────────────

function FilesTab({
  appId,
  files,
  onReload,
}: {
  appId: string;
  files: DbAppFile[];
  onReload: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ uploaded?: number; error?: string } | null>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadResult(null);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(`/api/apps/${appId}/files`, { method: "POST", body: formData });
      const data = await res.json();
      setUploadResult(data.error ? { error: data.error } : { uploaded: data.uploaded });
      if (!data.error) onReload();
    } catch {
      setUploadResult({ error: "Upload failed" });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const byCategory = files.reduce<Record<string, DbAppFile[]>>((acc, f) => {
    const cat = f.category ?? "other";
    (acc[cat] ??= []).push(f);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-zinc-800 p-4 space-y-3">
        <div>
          <p className="text-sm font-medium">Upload entity files</p>
          <p className="text-xs text-zinc-500 mt-0.5">
            Upload a .zip file containing your entity/model files. Existing files will be replaced.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input ref={inputRef} type="file" accept=".zip" onChange={handleUpload} className="hidden" id="zip-upload" />
          <label
            htmlFor="zip-upload"
            className={`cursor-pointer bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm px-4 py-2 rounded-lg transition-colors ${uploading ? "opacity-40 pointer-events-none" : ""}`}
          >
            {uploading ? "Uploading..." : "Choose .zip file"}
          </label>
        </div>
        {uploadResult && (
          <p className={`text-sm ${uploadResult.error ? "text-red-400" : "text-green-400"}`}>
            {uploadResult.error ?? `${uploadResult.uploaded} file(s) uploaded successfully`}
          </p>
        )}
      </div>

      {files.length === 0 && (
        <p className="text-zinc-500 text-sm">No files uploaded yet.</p>
      )}

      {Object.entries(byCategory).map(([cat, catFiles]) => (
        <div key={cat}>
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">{cat}</p>
          <div className="rounded-lg border border-zinc-800 divide-y divide-zinc-800/50">
            {catFiles.map((f) => (
              <div key={f.id} className="px-4 py-2.5">
                <p className="text-sm font-mono text-zinc-300">{f.file_path}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Datasets Tab ─────────────────────────────────────────────────────────────

function DatasetsTab({
  appId,
  datasets,
  onReload,
}: {
  appId: string;
  datasets: DbAppDataset[];
  onReload: () => void;
}) {
  const [label, setLabel] = useState("");
  const [gcpProject, setGcpProject] = useState("");
  const [datasetId, setDatasetId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    if (!label.trim() || !gcpProject.trim() || !datasetId.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/apps/${appId}/datasets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, gcp_project_id: gcpProject, dataset_id: datasetId }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setLabel(""); setGcpProject(""); setDatasetId("");
      onReload();
    } catch {
      setError("Failed to add dataset");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/apps/${appId}/datasets/${id}`, { method: "DELETE" });
    onReload();
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-zinc-800 p-4 space-y-3">
        <p className="text-sm font-medium">Add BigQuery dataset</p>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-zinc-500">Label</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Production"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-zinc-500">GCP Project ID</label>
            <input
              value={gcpProject}
              onChange={(e) => setGcpProject(e.target.value)}
              placeholder="my-gcp-project"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-zinc-500">Dataset ID</label>
            <input
              value={datasetId}
              onChange={(e) => setDatasetId(e.target.value)}
              placeholder="my_dataset"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
            />
          </div>
        </div>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button
          onClick={handleAdd}
          disabled={!label.trim() || !gcpProject.trim() || !datasetId.trim() || saving}
          className="bg-zinc-100 text-zinc-900 text-sm font-medium px-4 py-2 rounded-lg hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? "Adding..." : "Add dataset"}
        </button>
      </div>

      {datasets.length === 0 && <p className="text-zinc-500 text-sm">No datasets yet.</p>}

      {datasets.length > 0 && (
        <div className="rounded-lg border border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/50">
                <th className="text-left px-4 py-2.5 text-xs text-zinc-500 font-medium uppercase tracking-wider">Label</th>
                <th className="text-left px-4 py-2.5 text-xs text-zinc-500 font-medium uppercase tracking-wider">GCP Project</th>
                <th className="text-left px-4 py-2.5 text-xs text-zinc-500 font-medium uppercase tracking-wider">Dataset</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {datasets.map((d) => (
                <tr key={d.id} className="border-b border-zinc-800/50 last:border-0">
                  <td className="px-4 py-2.5 text-zinc-200">{d.label}</td>
                  <td className="px-4 py-2.5 text-zinc-400 font-mono text-xs">{d.gcp_project_id}</td>
                  <td className="px-4 py-2.5 text-zinc-400 font-mono text-xs">{d.dataset_id}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => handleDelete(d.id)}
                      className="text-zinc-600 hover:text-red-400 text-xs transition-colors"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Members Tab ──────────────────────────────────────────────────────────────

function MembersTab({
  appId,
  members,
  onReload,
}: {
  appId: string;
  members: Member[];
  onReload: () => void;
}) {
  const [allUsers, setAllUsers] = useState<{ id: string; email: string; name: string | null }[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((d) => setAllUsers(d.users ?? []));
  }, []);

  const memberIds = new Set(members.map((m) => m.user_id));
  const addableUsers = allUsers.filter((u) => !memberIds.has(u.id));

  async function handleAdd() {
    if (!selectedUserId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/apps/${appId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: selectedUserId }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setSelectedUserId("");
      onReload();
    } catch {
      setError("Failed to add member");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(userId: string) {
    await fetch(`/api/apps/${appId}/members/${userId}`, { method: "DELETE" });
    onReload();
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-zinc-800 p-4 space-y-3">
        <p className="text-sm font-medium">Add member</p>
        <div className="flex gap-3">
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-zinc-600 transition-colors"
          >
            <option value="">Select a user...</option>
            {addableUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name ? `${u.name} (${u.email})` : u.email}
              </option>
            ))}
          </select>
          <button
            onClick={handleAdd}
            disabled={!selectedUserId || saving}
            className="bg-zinc-100 text-zinc-900 text-sm font-medium px-4 py-2 rounded-lg hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? "Adding..." : "Add"}
          </button>
        </div>
        {error && <p className="text-red-400 text-sm">{error}</p>}
      </div>

      {members.length === 0 && <p className="text-zinc-500 text-sm">No members yet.</p>}

      {members.length > 0 && (
        <div className="rounded-lg border border-zinc-800 divide-y divide-zinc-800/50">
          {members.map((m) => (
            <div key={m.user_id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm text-zinc-200">{m.users.name ?? m.users.email}</p>
                {m.users.name && <p className="text-xs text-zinc-500">{m.users.email}</p>}
              </div>
              <button
                onClick={() => handleRemove(m.user_id)}
                className="text-zinc-600 hover:text-red-400 text-xs transition-colors"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LoadingScreen() {
  return <div className="flex items-center justify-center min-h-screen"><span className="text-zinc-500 text-sm">Loading...</span></div>;
}
function AccessDenied() {
  return <div className="flex items-center justify-center min-h-screen"><p className="text-zinc-500 text-sm">Access denied.</p></div>;
}
