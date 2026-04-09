"use client";
import { useEffect, useState, useRef } from "react";
import {
  Upload, Database, Users, FileCode2, Trash2,
  Plus, Loader2, Check, AlertCircle, FileText,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { LoadingScreen } from "@/components/auth-guards";
import { cn } from "@/lib/utils";
import type { DbAppDataset, DbAppFile } from "@/lib/supabase";

interface AppDetail { id: string; name: string; description: string | null }
interface Member {
  user_id: string;
  users: { id: string; email: string; name: string | null; role: string };
}

export default function AdminAppDetailPage({ params }: { params: { id: string } }) {
  const [app, setApp] = useState<AppDetail | null>(null);
  const [datasets, setDatasets] = useState<DbAppDataset[]>([]);
  const [files, setFiles] = useState<DbAppFile[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
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

  useEffect(() => { reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <LoadingScreen />;
  if (!app) return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-muted-foreground text-sm">App not found.</p>
    </div>
  );

  return (
    <div className="p-8">
      {/* App header */}
      <div className="mb-8">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-muted border border-border flex items-center justify-center flex-shrink-0 mt-0.5">
            <Database className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">{app.name}</h1>
            {app.description && <p className="text-muted-foreground text-sm mt-1">{app.description}</p>}
          </div>
        </div>
      </div>

      <Tabs defaultValue="files">
        <TabsList className="mb-6">
          <TabsTrigger value="files" className="gap-2">
            <FileCode2 className="w-3.5 h-3.5" />
            Files
            {files.length > 0 && <span className="text-[10px] bg-muted-foreground/20 px-1.5 py-0.5 rounded-full">{files.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="datasets" className="gap-2">
            <Database className="w-3.5 h-3.5" />
            Datasets
            {datasets.length > 0 && <span className="text-[10px] bg-muted-foreground/20 px-1.5 py-0.5 rounded-full">{datasets.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="members" className="gap-2">
            <Users className="w-3.5 h-3.5" />
            Members
            {members.length > 0 && <span className="text-[10px] bg-muted-foreground/20 px-1.5 py-0.5 rounded-full">{members.length}</span>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="files">
          <FilesTab appId={params.id} files={files} onReload={reload} />
        </TabsContent>
        <TabsContent value="datasets">
          <DatasetsTab appId={params.id} datasets={datasets} onReload={reload} />
        </TabsContent>
        <TabsContent value="members">
          <MembersTab appId={params.id} members={members} onReload={reload} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Files Tab ──────────────────────────────────────────────────────────────────
function FilesTab({ appId, files, onReload }: { appId: string; files: DbAppFile[]; onReload: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ uploaded?: number; error?: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  async function handleUpload(file: File) {
    if (!file.name.endsWith(".zip")) { setUploadResult({ error: "Only .zip files are supported" }); return; }
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

  const categoryColors: Record<string, string> = {
    entity: "bg-blue-900/30 text-blue-300 border-blue-800/50",
    model:  "bg-green-900/30 text-green-300 border-green-800/50",
    schema: "bg-purple-900/30 text-purple-300 border-purple-800/50",
    enum:   "bg-amber-900/30 text-amber-300 border-amber-800/50",
    other:  "bg-muted text-muted-foreground border-border",
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Upload zone */}
      <div
        className={cn(
          "rounded-xl border-2 border-dashed p-8 text-center transition-colors cursor-pointer",
          dragOver ? "border-foreground/40 bg-muted" : "border-border hover:border-foreground/20 hover:bg-muted/50"
        )}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files[0];
          if (file) handleUpload(file);
        }}
      >
        <input ref={inputRef} type="file" accept=".zip" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} className="hidden" />
        <div className="flex flex-col items-center gap-3">
          {uploading ? (
            <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
          ) : (
            <Upload className="w-8 h-8 text-muted-foreground" />
          )}
          <div>
            <p className="text-sm font-medium">{uploading ? "Uploading…" : "Drop a .zip file here"}</p>
            <p className="text-xs text-muted-foreground mt-0.5">or click to browse · existing files will be replaced</p>
          </div>
        </div>
        {uploadResult && (
          <div className={cn("mt-4 flex items-center justify-center gap-1.5 text-sm", uploadResult.error ? "text-destructive" : "text-green-400")}>
            {uploadResult.error ? <AlertCircle className="w-4 h-4" /> : <Check className="w-4 h-4" />}
            {uploadResult.error ?? `${uploadResult.uploaded} file(s) uploaded successfully`}
          </div>
        )}
      </div>

      {/* File tree */}
      {files.length === 0 ? (
        <div className="text-center py-8">
          <FileText className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No files uploaded yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(byCategory).map(([cat, catFiles]) => (
            <div key={cat}>
              <div className="flex items-center gap-2 mb-2">
                <span className={cn("inline-flex px-2 py-0.5 rounded text-[11px] border font-medium uppercase tracking-wide", categoryColors[cat] ?? categoryColors.other)}>
                  {cat}
                </span>
                <Separator className="flex-1" />
                <span className="text-xs text-muted-foreground">{catFiles.length}</span>
              </div>
              <div className="rounded-xl border border-border bg-card divide-y divide-border/50 overflow-hidden">
                {catFiles.map((f) => (
                  <div key={f.id} className="flex items-center gap-3 px-4 py-2.5">
                    <FileText className="w-3.5 h-3.5 text-muted-foreground/50 flex-shrink-0" />
                    <code className="text-xs text-muted-foreground flex-1 truncate">{f.file_path}</code>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Datasets Tab ───────────────────────────────────────────────────────────────
function DatasetsTab({ appId, datasets, onReload }: { appId: string; datasets: DbAppDataset[]; onReload: () => void }) {
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
    } catch { setError("Failed to add dataset"); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/apps/${appId}/datasets/${id}`, { method: "DELETE" });
    onReload();
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Add form */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div>
          <p className="text-sm font-medium">Add BigQuery dataset</p>
          <p className="text-xs text-muted-foreground mt-0.5">Connect a BigQuery dataset to this app.</p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Label</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Production" className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">GCP Project ID</Label>
            <Input value={gcpProject} onChange={(e) => setGcpProject(e.target.value)} placeholder="my-project" className="h-9 text-sm font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Dataset ID</Label>
            <Input value={datasetId} onChange={(e) => setDatasetId(e.target.value)} placeholder="my_dataset" className="h-9 text-sm font-mono" />
          </div>
        </div>
        {error && (
          <p className="flex items-center gap-1.5 text-sm text-destructive">
            <AlertCircle className="w-4 h-4" />{error}
          </p>
        )}
        <button
          onClick={handleAdd}
          disabled={!label.trim() || !gcpProject.trim() || !datasetId.trim() || saving}
          className="flex items-center gap-2 bg-foreground text-background text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          {saving ? "Adding…" : "Add dataset"}
        </button>
      </div>

      {/* Datasets list */}
      {datasets.length === 0 ? (
        <div className="text-center py-8">
          <Database className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No datasets yet.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border bg-muted/30 grid grid-cols-[1fr_1fr_1fr_40px] gap-4">
            {["Label", "GCP Project", "Dataset", ""].map((h) => (
              <span key={h} className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">{h}</span>
            ))}
          </div>
          <div className="divide-y divide-border/50">
            {datasets.map((d) => (
              <div key={d.id} className="px-4 py-3 grid grid-cols-[1fr_1fr_1fr_40px] gap-4 items-center hover:bg-muted/20 transition-colors">
                <span className="text-sm font-medium">{d.label}</span>
                <code className="text-xs text-muted-foreground">{d.gcp_project_id}</code>
                <code className="text-xs text-muted-foreground">{d.dataset_id}</code>
                <button
                  onClick={() => handleDelete(d.id)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Members Tab ────────────────────────────────────────────────────────────────
function MembersTab({ appId, members, onReload }: { appId: string; members: Member[]; onReload: () => void }) {
  const [allUsers, setAllUsers] = useState<{ id: string; email: string; name: string | null }[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/users").then((r) => r.json()).then((d) => setAllUsers(d.users ?? []));
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
      setSelectedUserId(""); onReload();
    } catch { setError("Failed to add member"); }
    finally { setSaving(false); }
  }

  async function handleRemove(userId: string) {
    await fetch(`/api/apps/${appId}/members/${userId}`, { method: "DELETE" });
    onReload();
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Add member */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div>
          <p className="text-sm font-medium">Add member</p>
          <p className="text-xs text-muted-foreground mt-0.5">Give a user access to this app.</p>
        </div>
        <div className="flex items-end gap-3">
          <div className="flex-1 space-y-1.5">
            <Label className="text-xs">User</Label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
            >
              <option value="">Select a user…</option>
              {addableUsers.map((u) => (
                <option key={u.id} value={u.id}>{u.name ? `${u.name} (${u.email})` : u.email}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleAdd}
            disabled={!selectedUserId || saving}
            className="flex items-center gap-2 bg-foreground text-background text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity h-[38px]"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add
          </button>
        </div>
        {error && <p className="flex items-center gap-1.5 text-sm text-destructive"><AlertCircle className="w-4 h-4" />{error}</p>}
      </div>

      {/* Members list */}
      {members.length === 0 ? (
        <div className="text-center py-8">
          <Users className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No members yet.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border/50">
          {members.map((m) => {
            const u = m.users;
            const initials = u.name
              ? u.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
              : u.email[0]?.toUpperCase() ?? "?";
            return (
              <div key={m.user_id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors">
                <div className="w-8 h-8 rounded-full bg-muted border border-border flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-medium text-foreground">{initials}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{u.name ?? u.email}</p>
                  {u.name && <p className="text-xs text-muted-foreground truncate">{u.email}</p>}
                </div>
                <Badge variant="secondary" className="text-xs">{u.role}</Badge>
                <button
                  onClick={() => handleRemove(m.user_id)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
