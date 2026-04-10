"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowLeft, BookOpen, Brain, ChevronDown, ChevronRight, Copy,
  Check, Database, FileText, FolderOpen, Loader2, Plus, Search,
  Send, Table2, Terminal, X, BookMarked,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { UserNav } from "@/components/layout/user-nav";
import { LoadingScreen, AccessDenied } from "@/components/auth-guards";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import type { DbAppDataset } from "@/lib/supabase";
import type { Message, AgentStep } from "@/lib/agent/runner";

interface AppInfo { id: string; name: string; description: string | null }

interface LiveStep {
  icon: AgentStep["type"] | "thinking";
  label: string;
  detail?: string;
  expandable: boolean;
  status: "running" | "done";
}

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  clarification?: string;
  steps?: AgentStep[];
}

// ── Conversation storage helpers ───────────────────────────────────────────────
interface ConversationMeta { id: string; title: string; updatedAt: number }
interface ConvIndex { activeId: string; conversations: ConversationMeta[] }

const idxKey  = (a: string, d: string)             => `bq-conv-index-v1:${a}:${d}`;
const dataKey = (a: string, d: string, c: string)  => `bq-conv-v1:${a}:${d}:${c}`;

function loadIndex(a: string, d: string): ConvIndex | null {
  try { const s = localStorage.getItem(idxKey(a, d)); return s ? JSON.parse(s) : null; } catch { return null; }
}
function saveIndex(a: string, d: string, idx: ConvIndex) {
  try { localStorage.setItem(idxKey(a, d), JSON.stringify(idx)); } catch { /* quota */ }
}
function loadConvData(a: string, d: string, c: string): { chat: ChatMessage[]; history: Message[] } {
  try { const s = localStorage.getItem(dataKey(a, d, c)); return s ? JSON.parse(s) : { chat: [], history: [] }; }
  catch { return { chat: [], history: [] }; }
}
function saveConvData(a: string, d: string, c: string, chat: ChatMessage[], history: Message[]) {
  try { localStorage.setItem(dataKey(a, d, c), JSON.stringify({ chat: chat.slice(-30), history: history.slice(-60) })); }
  catch { /* quota */ }
}
function dropConvData(a: string, d: string, c: string) {
  try { localStorage.removeItem(dataKey(a, d, c)); } catch { /* ignore */ }
}
function freshConv(): ConversationMeta {
  return { id: crypto.randomUUID(), title: "New conversation", updatedAt: Date.now() };
}

// ── useConversations hook ──────────────────────────────────────────────────────
// Manages a list of named conversations per app+dataset, all in localStorage.
// The loadedFor guard prevents the save effects from firing with stale state
// when the dataset or active conversation changes.
function useConversations(appId: string, datasetId: string) {
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const [activeId, setActiveId]           = useState<string | null>(null);
  const [chat, setChat]                   = useState<ChatMessage[]>([]);
  const [history, setHistory]             = useState<Message[]>([]);
  const [loadedFor, setLoadedFor]         = useState<{ datasetId: string; convId: string } | null>(null);

  // Load conversation list + active conversation when dataset changes
  useEffect(() => {
    if (!datasetId) return;
    setLoadedFor(null);

    const idx = loadIndex(appId, datasetId);
    let convs: ConversationMeta[];
    let targetId: string;

    if (!idx || idx.conversations.length === 0) {
      const f = freshConv();
      convs    = [f];
      targetId = f.id;
      saveIndex(appId, datasetId, { activeId: targetId, conversations: convs });
    } else {
      convs    = idx.conversations;
      targetId = (idx.activeId && convs.find((c) => c.id === idx.activeId)) ? idx.activeId : convs[0].id;
    }

    const data = loadConvData(appId, datasetId, targetId);
    setConversations(convs);
    setActiveId(targetId);
    setChat(data.chat);
    setHistory(data.history);
    setLoadedFor({ datasetId, convId: targetId });
  }, [appId, datasetId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist chat + history whenever they change (guarded against stale state)
  useEffect(() => {
    if (!loadedFor || loadedFor.datasetId !== datasetId || loadedFor.convId !== activeId || !activeId) return;
    saveConvData(appId, datasetId, activeId, chat, history);
  }, [chat, history]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update conversation title and sort order when messages are added/removed
  useEffect(() => {
    if (!loadedFor || loadedFor.datasetId !== datasetId || loadedFor.convId !== activeId || !activeId || chat.length === 0) return;
    const title   = chat.find((m) => m.role === "user")?.text.slice(0, 50) ?? "New conversation";
    const updated = conversations
      .map((c) => (c.id === activeId ? { ...c, title, updatedAt: Date.now() } : c))
      .sort((a, b) => b.updatedAt - a.updatedAt);
    setConversations(updated);
    saveIndex(appId, datasetId, { activeId, conversations: updated });
  }, [chat.length]); // eslint-disable-line react-hooks/exhaustive-deps

  function newConversation() {
    if (!datasetId) return;
    const f    = freshConv();
    const next = [f, ...conversations];
    setConversations(next);
    setActiveId(f.id);
    setChat([]);
    setHistory([]);
    setLoadedFor({ datasetId, convId: f.id });
    saveIndex(appId, datasetId, { activeId: f.id, conversations: next });
  }

  function switchConversation(convId: string) {
    if (convId === activeId || !datasetId) return;
    const data = loadConvData(appId, datasetId, convId);
    setActiveId(convId);
    setChat(data.chat);
    setHistory(data.history);
    setLoadedFor({ datasetId, convId });
    saveIndex(appId, datasetId, { activeId: convId, conversations });
  }

  function deleteConversation(convId: string) {
    if (!datasetId) return;
    dropConvData(appId, datasetId, convId);
    const next = conversations.filter((c) => c.id !== convId);

    if (next.length === 0) {
      const f = freshConv();
      saveIndex(appId, datasetId, { activeId: f.id, conversations: [f] });
      setConversations([f]);
      setActiveId(f.id);
      setChat([]);
      setHistory([]);
      setLoadedFor({ datasetId, convId: f.id });
      return;
    }

    const newActiveId = convId === activeId ? next[0].id : activeId!;
    saveIndex(appId, datasetId, { activeId: newActiveId, conversations: next });
    setConversations(next);

    if (convId === activeId) {
      const data = loadConvData(appId, datasetId, next[0].id);
      setActiveId(next[0].id);
      setChat(data.chat);
      setHistory(data.history);
      setLoadedFor({ datasetId, convId: next[0].id });
    }
  }

  return { conversations, activeId, chat, setChat, history, setHistory, newConversation, switchConversation, deleteConversation };
}

function eventToStep(event: Record<string, unknown>): LiveStep | null {
  switch (event.type) {
    case "thinking":       return { icon: "thinking", label: "Thinking…", expandable: false, status: "running" };
    case "thought":        return { icon: "thought", label: "Reasoning", detail: event.text as string, expandable: true, status: "running" };
    case "listing_files":  return { icon: "listing_files", label: "Exploring entity files", expandable: false, status: "running" };
    case "reading_file":   return { icon: "reading_file", label: `Reading ${(event.path as string).split("/").pop()}`, expandable: false, status: "running" };
    case "listing_tables": return { icon: "listing_tables", label: "Fetching table list", expandable: false, status: "running" };
    case "getting_schema": return { icon: "getting_schema", label: `Schema: ${event.table}`, expandable: false, status: "running" };
    case "running_query":  return { icon: "query", label: "Running query…", detail: event.sql as string, expandable: true, status: "running" };
    case "memory_updated": return { icon: "memory_update", label: "Saved to memory", expandable: false, status: "running" };
    default: return null;
  }
}

export default function AppQueryPage({ params }: { params: { id: string } }) {
  const session = useAuth();
  const [app, setApp] = useState<AppInfo | null>(null);
  const [datasets, setDatasets] = useState<DbAppDataset[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const { conversations, activeId, chat, setChat, history, setHistory, newConversation, switchConversation, deleteConversation } = useConversations(params.id, selectedDatasetId);
  const [question, setQuestion] = useState("");
  const [thinking, setThinking] = useState(false);
  const [liveSteps, setLiveSteps] = useState<LiveStep[]>([]);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetch(`/api/apps/${params.id}`)
      .then((r) => r.json())
      .then((d) => {
        setApp(d.app);
        setDatasets(d.datasets ?? []);
        if (d.datasets?.length > 0) setSelectedDatasetId(d.datasets[0].id);
      })
      .finally(() => setLoading(false));
  }, [params.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat, liveSteps]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
  }, [question]);

  async function sendQuestion(q: string) {
    if (!q.trim() || !selectedDatasetId || thinking) return;
    setChat((prev) => [...prev, { role: "user", text: q }]);
    setQuestion("");
    setThinking(true);
    setLiveSteps([]);

    try {
      const res = await fetch(`/api/apps/${params.id}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ datasetId: selectedDatasetId, question: q, history }),
      });
      if (!res.body) throw new Error("No response stream");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          let event: Record<string, unknown>;
          try { event = JSON.parse(line.slice(6)); } catch { continue; }

          if (event.type === "query_done") {
            setLiveSteps((prev) => {
              const next = [...prev];
              for (let i = next.length - 1; i >= 0; i--) {
                if (next[i].label.startsWith("Running query")) {
                  next[i] = { ...next[i], label: `Query → ${event.rows} row${event.rows !== 1 ? "s" : ""}`, status: "done" };
                  break;
                }
              }
              return next;
            });
            continue;
          }

          const step = eventToStep(event);
          if (step) {
            setLiveSteps((prev) => {
              const next = prev.map((s) => s.status === "running" ? { ...s, status: "done" as const } : s);
              return [...next, step];
            });
            continue;
          }

          if (event.type === "done") {
            setHistory((event.history as Message[]) ?? []);
            setChat((prev) => [...prev, { role: "assistant", text: event.answer as string, steps: (event.steps as AgentStep[]) ?? [] }]);
            setThinking(false);
            setLiveSteps([]);
          } else if (event.type === "clarification") {
            setHistory((event.history as Message[]) ?? []);
            setChat((prev) => [...prev, { role: "assistant", text: "", clarification: event.question as string, steps: (event.steps as AgentStep[]) ?? [] }]);
            setThinking(false);
            setLiveSteps([]);
          } else if (event.type === "error") {
            setChat((prev) => [...prev, { role: "assistant", text: `Error: ${event.message}` }]);
            setThinking(false);
            setLiveSteps([]);
          }
        }
      }
    } catch (err) {
      setChat((prev) => [...prev, { role: "assistant", text: `Error: ${err instanceof Error ? err.message : "Request failed"}` }]);
      setThinking(false);
      setLiveSteps([]);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendQuestion(question); }
  }

  if (loading) return <LoadingScreen />;
  if (!session || !app) return <AccessDenied message="App not found or access denied." />;

  const selectedDataset = datasets.find((d) => d.id === selectedDatasetId);

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* ── Header ── */}
      <header className="flex-shrink-0 border-b border-border bg-background/80 backdrop-blur-sm px-4 h-14 flex items-center gap-3">
        <Link href="/apps" className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <Separator orientation="vertical" className="h-5" />
        <span className="font-semibold text-sm truncate flex-shrink-0">{app.name}</span>

        {/* Dataset selector */}
        {datasets.length > 0 && (
          <div className="flex items-center gap-2 ml-2">
            <Database className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            {datasets.length === 1 ? (
              <Badge variant="secondary" className="text-xs font-normal">{selectedDataset?.label}</Badge>
            ) : (
              <select
                value={selectedDatasetId}
                onChange={(e) => setSelectedDatasetId(e.target.value)}
                className="bg-secondary text-secondary-foreground text-xs rounded-md px-2 py-1 border border-border focus:outline-none focus:ring-1 focus:ring-ring transition-colors cursor-pointer"
              >
                {datasets.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
              </select>
            )}
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setMemoryOpen(true)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border hover:border-border/80 hover:bg-accent rounded-lg px-2.5 py-1.5 transition-colors"
          >
            <BookOpen className="w-3.5 h-3.5" />
            Memory
          </button>
          <UserNav email={session.user?.email} name={session.user?.name} role={session.role} showAdminLink={["admin","superadmin"].includes(session.role)} />
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* ── Conversation sidebar ── */}
        <ConversationSidebar
          conversations={conversations}
          activeId={activeId}
          onNew={newConversation}
          onSwitch={switchConversation}
          onDelete={deleteConversation}
        />

        <div className="flex-1 flex flex-col min-w-0">
        {/* ── Chat area ── */}
        <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
          {/* Empty state */}
          {chat.length === 0 && !thinking && (
            <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
              <div className="w-10 h-10 rounded-xl bg-muted border border-border flex items-center justify-center">
                <Database className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium text-sm">{app.name}</p>
                {selectedDataset && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {selectedDataset.gcp_project_id}.{selectedDataset.dataset_id}
                  </p>
                )}
              </div>
              <p className="text-sm text-muted-foreground max-w-sm">
                Ask any question about your data in plain English.
              </p>
            </div>
          )}

          {/* Messages */}
          {chat.map((msg, i) => (
            <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
              {msg.role === "user" ? (
                <div className="max-w-lg bg-foreground text-background rounded-2xl rounded-br-sm px-4 py-2.5">
                  <p className="text-sm">{msg.text}</p>
                </div>
              ) : (
                <div className="max-w-2xl w-full space-y-1">
                  {msg.steps && msg.steps.length > 0 && <FrozenTrace steps={msg.steps} />}
                  {(msg.text || msg.clarification) && (
                    <div className={cn(
                      "rounded-2xl rounded-bl-sm bg-card border border-border px-4 py-3",
                      msg.steps && msg.steps.length > 0 && "rounded-tl-none border-t-0"
                    )}>
                      {msg.clarification ? (
                        <>
                          <p className="text-xs text-amber-400 font-medium uppercase tracking-wider mb-1.5">Clarification needed</p>
                          <p className="text-sm">{msg.clarification}</p>
                        </>
                      ) : (
                        <MarkdownMessage text={msg.text} />
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Live trace */}
          {thinking && (
            <div className="flex justify-start">
              <div className="max-w-2xl w-full">
                <LiveTrace steps={liveSteps} />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* ── Input bar ── */}
      <div className="flex-shrink-0 border-t border-border bg-background px-4 py-3">
        <div className="max-w-2xl mx-auto">
          {datasets.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-2">No datasets configured for this app.</p>
          ) : (
            <div className="flex gap-2 items-end bg-card border border-border rounded-xl p-2 focus-within:border-foreground/30 transition-colors">
              <textarea
                ref={textareaRef}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask a question about your data…"
                rows={1}
                disabled={thinking}
                className="flex-1 bg-transparent px-2 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none resize-none disabled:opacity-40 leading-relaxed"
                style={{ maxHeight: "120px" }}
              />
              <button
                onClick={() => sendQuestion(question)}
                disabled={!question.trim() || thinking}
                className="flex-shrink-0 flex items-center justify-center w-8 h-8 bg-foreground text-background rounded-lg hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
              >
                {thinking
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Send className="w-3.5 h-3.5" />
                }
              </button>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground/50 mt-1.5 text-center">
            Enter to send · Shift+Enter for new line
          </p>
        </div>
      </div>

        </div>{/* end flex-1 flex flex-col */}
      </div>{/* end flex-1 flex min-h-0 */}

      {/* ── Memory panel ── */}
      {memoryOpen && <MemoryPanel appId={params.id} onClose={() => setMemoryOpen(false)} />}
    </div>
  );
}

// ── Conversation sidebar ───────────────────────────────────────────────────────
function ConversationSidebar({
  conversations,
  activeId,
  onNew,
  onSwitch,
  onDelete,
}: {
  conversations: ConversationMeta[];
  activeId: string | null;
  onNew: () => void;
  onSwitch: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <aside className="w-52 flex-shrink-0 border-r border-border bg-background flex flex-col">
      <div className="p-2 border-b border-border">
        <button
          onClick={onNew}
          className="w-full flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg px-3 py-2 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          New conversation
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {conversations.map((conv) => (
          <div
            key={conv.id}
            className={cn(
              "group flex items-center gap-1 mx-1 my-0.5 rounded-lg px-2 py-2",
              conv.id === activeId ? "bg-accent" : "hover:bg-accent/50 cursor-pointer"
            )}
          >
            <button
              onClick={() => onSwitch(conv.id)}
              className="flex-1 text-left min-w-0"
            >
              <span className={cn(
                "text-xs block truncate",
                conv.id === activeId ? "text-foreground font-medium" : "text-muted-foreground"
              )}>
                {conv.title}
              </span>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
              className="flex-shrink-0 opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-all"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}

// ── Step icon map ──────────────────────────────────────────────────────────────
function StepIcon({ type, className }: { type: AgentStep["type"] | "thinking"; className?: string }) {
  const cls = cn("w-3.5 h-3.5 flex-shrink-0", className);
  switch (type) {
    case "thought":        return <Brain className={cls} />;
    case "reading_file":   return <FileText className={cls} />;
    case "listing_files":  return <FolderOpen className={cls} />;
    case "listing_tables": return <Table2 className={cls} />;
    case "getting_schema": return <Search className={cls} />;
    case "query":          return <Terminal className={cls} />;
    case "memory_update":  return <BookMarked className={cls} />;
    default:               return null;
  }
}

// ── Copy button ────────────────────────────────────────────────────────────────
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}
      className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
    >
      {copied ? <><Check className="w-3 h-3" />Copied</> : <><Copy className="w-3 h-3" />Copy</>}
    </button>
  );
}

// ── Query results preview ──────────────────────────────────────────────────────
function QueryPreview({ rows, schema, totalRows }: { rows: Record<string, unknown>[]; schema: Array<{ name: string; type: string }>; totalRows?: number }) {
  const truncated = totalRows !== undefined && totalRows > rows.length;
  return (
    <div className="border-t border-border/60">
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/30 border-b border-border/60">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Preview</span>
        {truncated && <span className="text-[10px] text-muted-foreground">showing {rows.length} of {totalRows} rows</span>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[10px] font-mono">
          <thead>
            <tr className="border-b border-border/40">
              {schema.map((col) => <th key={col.name} className="px-3 py-1.5 text-left text-muted-foreground font-medium whitespace-nowrap">{col.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className={i < rows.length - 1 ? "border-b border-border/30" : ""}>
                {schema.map((col) => (
                  <td key={col.name} className="px-3 py-1.5 text-muted-foreground/80 whitespace-nowrap max-w-[200px] truncate">
                    {row[col.name] == null ? <span className="text-muted-foreground/40">null</span> : String(row[col.name])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Live trace ─────────────────────────────────────────────────────────────────
function LiveTrace({ steps }: { steps: LiveStep[] }) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const visible = steps.filter((s) => !(s.icon === "thinking" && s.status === "done"));
  const lastIsDone = visible.length > 0 && visible[visible.length - 1].status === "done";

  if (visible.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card px-4 py-3 flex items-center gap-2.5">
        <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin" />
        <span className="text-xs text-muted-foreground">Thinking…</span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {visible.map((step, i) => {
        const isRunning = step.status === "running";
        const isExpanded = expandedIdx === i;
        return (
          <div key={i} className={i < visible.length - 1 ? "border-b border-border/60" : ""}>
            <button
              onClick={step.expandable ? () => setExpandedIdx(isExpanded ? null : i) : undefined}
              className={cn("w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors", step.expandable ? "hover:bg-accent/50 cursor-pointer" : "cursor-default")}
            >
              <span className="flex-shrink-0 w-4 flex items-center justify-center">
                {isRunning
                  ? <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
                  : <Check className="w-3 h-3 text-muted-foreground/50" />
                }
              </span>
              {step.icon !== "thinking" && <StepIcon type={step.icon} className={isRunning ? "text-foreground" : "text-muted-foreground/60"} />}
              <span className={cn("text-xs flex-1", isRunning ? "text-foreground font-medium" : "text-muted-foreground")}>{step.label}</span>
              {step.expandable && step.detail && (
                <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground/60 transition-transform", isExpanded && "rotate-180")} />
              )}
            </button>
            {isExpanded && step.detail && (
              <div className="border-t border-border/60 bg-background/50">
                <div className="flex items-center justify-between px-4 py-1.5 border-b border-border/40">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                    {step.icon === "thought" ? "Reasoning" : "SQL"}
                  </span>
                  {step.icon !== "thought" && <CopyButton text={step.detail} />}
                </div>
                <pre className="px-4 py-3 text-xs text-muted-foreground font-mono whitespace-pre-wrap overflow-x-auto leading-relaxed">{step.detail.trim()}</pre>
              </div>
            )}
          </div>
        );
      })}
      {lastIsDone && (
        <div className="border-t border-border/60 px-4 py-2.5 flex items-center gap-2">
          <Loader2 className="w-3 h-3 text-muted-foreground/50 animate-spin" />
          <span className="text-xs text-muted-foreground/50">Working…</span>
        </div>
      )}
    </div>
  );
}

// ── Frozen trace ───────────────────────────────────────────────────────────────
function FrozenTrace({ steps }: { steps: AgentStep[] }) {
  const [expanded, setExpanded] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const queryCount = steps.filter((s) => s.type === "query").length;
  const summary = queryCount > 0
    ? `${steps.length} step${steps.length !== 1 ? "s" : ""} · ${queryCount} quer${queryCount !== 1 ? "ies" : "y"}`
    : `${steps.length} step${steps.length !== 1 ? "s" : ""}`;

  function stepLabel(s: AgentStep) {
    switch (s.type) {
      case "thought":        return "Reasoning";
      case "reading_file":   return `Read ${s.path.split("/").pop()}`;
      case "listing_files":  return "Listed entity files";
      case "listing_tables": return "Fetched table list";
      case "getting_schema": return `Schema: ${s.table}`;
      case "query":          return s.error ? "Query failed" : `Query · ${s.rows} row${s.rows !== 1 ? "s" : ""}`;
      case "memory_update":  return "Saved to memory";
    }
  }

  function stepDetail(s: AgentStep) {
    if (s.type === "thought") return s.text;
    if (s.type === "query") return s.sql;
  }

  return (
    <div className="mb-1">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="group flex items-center gap-1.5 px-1.5 py-1 rounded-md hover:bg-accent/50 transition-colors"
      >
        <ChevronRight className={cn("w-3 h-3 text-muted-foreground/60 transition-transform", expanded && "rotate-90")} />
        <span className="text-[11px] text-muted-foreground group-hover:text-muted-foreground/80 font-medium">{summary}</span>
      </button>

      {expanded && (
        <div className="mt-1 ml-1 space-y-px">
          {steps.map((step, i) => {
            const detail = stepDetail(step);
            const canExpand = (step.type === "thought" || step.type === "query") && !!detail;
            const isError = step.type === "query" && step.error;
            const isExpanded = expandedIdx === i;
            return (
              <div key={i}>
                <button
                  onClick={canExpand ? () => setExpandedIdx(isExpanded ? null : i) : undefined}
                  className={cn("w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-left transition-colors", canExpand ? "hover:bg-accent/30 cursor-pointer" : "cursor-default")}
                >
                  <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                    {isError
                      ? <span className="w-2 h-2 rounded-full bg-destructive" />
                      : <Check className="w-3 h-3 text-muted-foreground/40" />
                    }
                  </span>
                  <StepIcon type={step.type} className={isError ? "text-destructive" : "text-muted-foreground/50"} />
                  <span className={cn("text-xs flex-1", isError ? "text-destructive" : "text-muted-foreground/70")}>{stepLabel(step)}</span>
                  {canExpand && <ChevronDown className={cn("w-3 h-3 text-muted-foreground/40 transition-transform", isExpanded && "rotate-180")} />}
                </button>
                {isExpanded && detail && (
                  <div className="mx-3 mb-1 rounded-lg overflow-hidden border border-border bg-background/50">
                    {step.type === "thought" ? (
                      <>
                        <div className="px-3 py-1.5 border-b border-border/60 bg-muted/30">
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Reasoning</span>
                        </div>
                        <pre className="px-3 py-2.5 text-xs text-muted-foreground font-mono whitespace-pre-wrap leading-relaxed">{step.text.trim()}</pre>
                      </>
                    ) : step.type === "query" ? (
                      <>
                        <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/60 bg-muted/30">
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">SQL</span>
                          <CopyButton text={step.sql} />
                        </div>
                        <pre className="px-3 py-2.5 text-xs text-muted-foreground font-mono whitespace-pre-wrap leading-relaxed">{step.sql.trim()}</pre>
                        {step.preview && step.preview.length > 0 && step.schema && (
                          <QueryPreview rows={step.preview} schema={step.schema} totalRows={step.rows} />
                        )}
                      </>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Markdown renderer ──────────────────────────────────────────────────────────
function MarkdownMessage({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => <h1 className="text-base font-semibold mt-3 mb-1 first:mt-0">{children}</h1>,
        h2: ({ children }) => <h2 className="text-sm font-semibold mt-3 mb-1 first:mt-0">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-semibold mt-2 mb-1 first:mt-0">{children}</h3>,
        p:  ({ children }) => <p className="text-sm leading-relaxed mb-2 last:mb-0">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        em:     ({ children }) => <em className="italic text-muted-foreground">{children}</em>,
        code: ({ children, className }) => className
          ? <code className="block bg-background border border-border rounded-lg px-3 py-2 text-xs font-mono overflow-x-auto my-2 whitespace-pre">{children}</code>
          : <code className="bg-muted text-foreground rounded px-1 py-0.5 text-xs font-mono">{children}</code>,
        pre: ({ children }) => <>{children}</>,
        hr:  () => <hr className="border-border my-3" />,
        ul:  ({ children }) => <ul className="list-disc list-inside text-sm space-y-0.5 mb-2 last:mb-0 pl-2">{children}</ul>,
        ol:  ({ children }) => <ol className="list-decimal list-inside text-sm space-y-0.5 mb-2 last:mb-0 pl-2">{children}</ol>,
        li:  ({ children }) => <li className="text-muted-foreground">{children}</li>,
        table: ({ children }) => (
          <div className="overflow-x-auto my-3 rounded-lg border border-border">
            <table className="w-full text-sm border-collapse">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-muted">{children}</thead>,
        tbody: ({ children }) => <tbody className="divide-y divide-border/50">{children}</tbody>,
        tr:    ({ children }) => <tr className="hover:bg-muted/40 transition-colors">{children}</tr>,
        th:    ({ children }) => <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{children}</th>,
        td:    ({ children }) => <td className="px-4 py-2.5 text-sm">{children}</td>,
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

// ── Memory panel ───────────────────────────────────────────────────────────────
function MemoryPanel({ appId, onClose }: { appId: string; onClose: () => void }) {
  const [content, setContent] = useState("");
  const [loadState, setLoadState] = useState<"loading" | "ready" | "saving" | "saved">("loading");

  useEffect(() => {
    fetch(`/api/apps/${appId}/memory`)
      .then((r) => r.json())
      .then((d) => { setContent(d.content ?? ""); setLoadState("ready"); });
  }, [appId]);

  async function save() {
    setLoadState("saving");
    await fetch(`/api/apps/${appId}/memory`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    setLoadState("saved");
    setTimeout(() => setLoadState("ready"), 1500);
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[460px] bg-background border-l border-border z-50 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <BookOpen className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-semibold">App Memory</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors w-7 h-7 flex items-center justify-center rounded-md hover:bg-accent">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Description */}
        <div className="px-5 py-3 border-b border-border/60 flex-shrink-0">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Schema facts shared across all users. Claude reads this before every query and updates it when it learns something new.
            Focus on column types, enum values, and join patterns.
          </p>
        </div>

        {/* Editor */}
        <div className="flex-1 overflow-hidden flex flex-col p-4 gap-3">
          {loadState === "loading" ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
            </div>
          ) : (
            <textarea
              value={content}
              onChange={(e) => { setContent(e.target.value); if (loadState === "saved") setLoadState("ready"); }}
              placeholder={`## table_name\n- Column facts, enum values, join patterns\n\n## another_table\n- ...`}
              className="flex-1 w-full bg-card border border-border rounded-lg px-4 py-3 text-xs text-foreground font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:border-foreground/30 transition-colors resize-none leading-relaxed"
              spellCheck={false}
            />
          )}

          <div className="flex items-center justify-between flex-shrink-0">
            <span className="text-[11px] text-muted-foreground/50">
              {content.length > 0 ? `${content.split("\n").length} lines` : "Empty"}
            </span>
            <div className="flex items-center gap-2">
              <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 transition-colors">
                Cancel
              </button>
              <button
                onClick={save}
                disabled={loadState === "loading" || loadState === "saving"}
                className="flex items-center gap-1.5 text-xs bg-foreground text-background hover:opacity-90 px-3 py-1.5 rounded-lg transition-opacity disabled:opacity-40 font-medium"
              >
                {loadState === "saving" && <Loader2 className="w-3 h-3 animate-spin" />}
                {loadState === "saved" ? <><Check className="w-3 h-3" />Saved</> : loadState === "saving" ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
