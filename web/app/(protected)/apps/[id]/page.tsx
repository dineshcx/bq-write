"use client";
import { signOut } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { DbAppDataset } from "@/lib/supabase";
import type { Message, AgentStep } from "@/lib/agent/runner";
import { LoadingScreen, AccessDenied } from "@/components/auth-guards";
import { useAuth } from "@/lib/auth-context";

interface AppInfo {
  id: string;
  name: string;
  description: string | null;
}

// A step in the live trace while the agent is running
interface LiveStep {
  icon: AgentStep["type"] | "thinking";
  label: string;
  detail?: string;       // thought text or SQL — shown on expand
  expandable: boolean;
  status: "running" | "done";
}

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  clarification?: string;
  steps?: AgentStep[];   // frozen trace after done
}

// ─── Event → LiveStep mapping ──────────────────────────────────────────────

function eventToStep(event: Record<string, unknown>): LiveStep | null {
  switch (event.type) {
    case "thinking":
      return { icon: "thinking", label: "Thinking…", expandable: false, status: "running" };
    case "thought":
      return { icon: "thought", label: "Reasoning", detail: event.text as string, expandable: true, status: "running" };
    case "listing_files":
      return { icon: "listing_files", label: "Exploring entity files", expandable: false, status: "running" };
    case "reading_file":
      return { icon: "reading_file", label: `Reading ${(event.path as string).split("/").pop()}`, expandable: false, status: "running" };
    case "listing_tables":
      return { icon: "listing_tables", label: "Fetching table list", expandable: false, status: "running" };
    case "getting_schema":
      return { icon: "getting_schema", label: `Schema: ${event.table}`, expandable: false, status: "running" };
    case "running_query":
      return { icon: "query", label: "Running query…", detail: event.sql as string, expandable: true, status: "running" };
    case "memory_updated":
      return { icon: "memory_update", label: "Saved to memory", expandable: false, status: "running" };
    default:
      return null;
  }
}

export default function AppQueryPage({ params }: { params: { id: string } }) {
  const session = useAuth();
  const [app, setApp] = useState<AppInfo | null>(null);
  const [datasets, setDatasets] = useState<DbAppDataset[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [history, setHistory] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [thinking, setThinking] = useState(false);
  const [liveSteps, setLiveSteps] = useState<LiveStep[]>([]);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

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
            // Update the last running_query step with the row count
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
            // Mark the previous step as done, add new one
            setLiveSteps((prev) => {
              const next = prev.map((s) =>
                s.status === "running" ? { ...s, status: "done" as const } : s
              );
              return [...next, step];
            });
            continue;
          }

          if (event.type === "done") {
            setHistory((event.history as Message[]) ?? []);
            const finalSteps = event.steps as AgentStep[] | undefined;
            setChat((prev) => [
              ...prev,
              { role: "assistant", text: event.answer as string, steps: finalSteps ?? [] },
            ]);
            setThinking(false);
            setLiveSteps([]);
          } else if (event.type === "clarification") {
            setHistory((event.history as Message[]) ?? []);
            setChat((prev) => [
              ...prev,
              { role: "assistant", text: "", clarification: event.question as string, steps: (event.steps as AgentStep[]) ?? [] },
            ]);
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
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendQuestion(question);
    }
  }

  if (loading) return <LoadingScreen />;
  if (!session || !app) return <AccessDenied message="App not found or access denied." />;

  const selectedDataset = datasets.find((d) => d.id === selectedDatasetId);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-zinc-800 px-6 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/apps" className="text-zinc-400 hover:text-zinc-200 transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
          </Link>
          <span className="font-semibold text-sm">{app.name}</span>
        </div>
        <div className="flex items-center gap-3">
          {datasets.length > 1 && (
            <select
              value={selectedDatasetId}
              onChange={(e) => { setSelectedDatasetId(e.target.value); setChat([]); setHistory([]); }}
              className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm text-zinc-300 focus:outline-none focus:border-zinc-600 transition-colors"
            >
              {datasets.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
          )}
          {datasets.length === 1 && selectedDataset && (
            <span className="text-xs text-zinc-500 bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1">
              {selectedDataset.label}
            </span>
          )}
          <button
            onClick={() => setMemoryOpen(true)}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-800 hover:border-zinc-700 rounded-lg px-2.5 py-1.5 transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z" />
              <path d="M12 8v4l3 3" />
            </svg>
            Memory
          </button>
          <span className="text-zinc-500 text-sm">{session.user?.email}</span>
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      {memoryOpen && (
        <MemoryPanel appId={params.id} onClose={() => setMemoryOpen(false)} />
      )}

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {chat.length === 0 && !thinking && (
            <div className="text-center pt-12">
              <p className="text-zinc-400 text-sm">Ask a question about your data.</p>
              {selectedDataset && (
                <p className="text-zinc-600 text-xs mt-1">{selectedDataset.gcp_project_id}.{selectedDataset.dataset_id}</p>
              )}
            </div>
          )}

          {chat.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "user" ? (
                <div className="max-w-xl bg-zinc-800 rounded-2xl rounded-br-sm px-4 py-2.5">
                  <p className="text-sm text-zinc-100">{msg.text}</p>
                </div>
              ) : (
                <div className="max-w-2xl w-full space-y-0">
                  {/* Frozen trace */}
                  {msg.steps && msg.steps.length > 0 && (
                    <FrozenTrace steps={msg.steps} />
                  )}
                  {/* Answer */}
                  {(msg.text || msg.clarification) && (
                    <div className={`rounded-2xl rounded-bl-sm bg-zinc-900 border border-zinc-800 px-4 py-3 ${msg.steps && msg.steps.length > 0 ? "rounded-tl-none border-t-0" : ""}`}>
                      {msg.clarification ? (
                        <>
                          <p className="text-xs text-yellow-500 uppercase tracking-wider mb-1">Clarification needed</p>
                          <p className="text-sm text-zinc-200">{msg.clarification}</p>
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

          {/* Live trace while thinking */}
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

      <div className="border-t border-zinc-800 px-6 py-4 flex-shrink-0">
        <div className="max-w-3xl mx-auto">
          {datasets.length === 0 ? (
            <p className="text-zinc-500 text-sm text-center">No datasets configured for this app.</p>
          ) : (
            <div className="flex gap-3 items-end">
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask a question about your data..."
                rows={1}
                disabled={thinking}
                className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors resize-none disabled:opacity-40"
                style={{ maxHeight: "120px", overflowY: "auto" }}
              />
              <button
                onClick={() => sendQuestion(question)}
                disabled={!question.trim() || thinking}
                className="bg-zinc-100 text-zinc-900 p-3 rounded-xl hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" />
                </svg>
              </button>
            </div>
          )}
          <p className="text-zinc-700 text-xs mt-2 text-center">Enter to send · Shift+Enter for new line</p>
        </div>
      </div>
    </div>
  );
}

// ─── Step icons ───────────────────────────────────────────────────────────────

function StepIcon({ type, className = "" }: { type: AgentStep["type"] | "thinking"; className?: string }) {
  const cls = `flex-shrink-0 ${className}`;
  switch (type) {
    case "thought":
      return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={cls}>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      );
    case "reading_file":
      return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={cls}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      );
    case "listing_files":
      return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={cls}>
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      );
    case "listing_tables":
      return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={cls}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="3" y1="15" x2="21" y2="15" />
          <line x1="9" y1="3" x2="9" y2="21" />
        </svg>
      );
    case "getting_schema":
      return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={cls}>
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      );
    case "query":
      return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={cls}>
          <polyline points="4 17 10 11 4 5" />
          <line x1="12" y1="19" x2="20" y2="19" />
        </svg>
      );
    case "memory_update":
      return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={cls}>
          <path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z" />
          <path d="M12 8v4l3 3" />
        </svg>
      );
    default:
      return null;
  }
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="flex items-center gap-1.5 text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
    >
      {copied ? (
        <>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M20 6L9 17l-5-5" />
          </svg>
          Copied
        </>
      ) : (
        <>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          Copy
        </>
      )}
    </button>
  );
}

function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      className={`animate-spin ${className}`}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={className}>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

// ─── Query results preview table ──────────────────────────────────────────────

function QueryPreview({ rows, schema, totalRows }: { rows: Record<string, unknown>[]; schema: Array<{ name: string; type: string }>; totalRows?: number }) {
  const truncated = totalRows !== undefined && totalRows > rows.length;
  return (
    <div className="border-t border-zinc-800/60">
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900/40 border-b border-zinc-800/60">
        <span className="text-zinc-700 text-[10px] uppercase tracking-wider font-medium">
          Preview
        </span>
        {truncated && (
          <span className="text-zinc-600 text-[10px]">
            showing {rows.length} of {totalRows} rows
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[10px] font-mono">
          <thead>
            <tr className="border-b border-zinc-800/40">
              {schema.map((col) => (
                <th key={col.name} className="px-3 py-1.5 text-left text-zinc-600 font-medium whitespace-nowrap">
                  {col.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className={i < rows.length - 1 ? "border-b border-zinc-800/30" : ""}>
                {schema.map((col) => (
                  <td key={col.name} className="px-3 py-1.5 text-zinc-500 whitespace-nowrap max-w-[200px] truncate">
                    {row[col.name] == null ? <span className="text-zinc-700">null</span> : String(row[col.name])}
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

// ─── Live trace (builds up while thinking) ────────────────────────────────────

function LiveTrace({ steps }: { steps: LiveStep[] }) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  // Drop transient "thinking" steps that are already done — they carry no meaning once complete
  const visible = steps.filter((s) => !(s.icon === "thinking" && s.status === "done"));
  const lastIsDone = visible.length > 0 && visible[visible.length - 1].status === "done";

  if (visible.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 flex items-center gap-2.5">
        <Spinner className="text-zinc-500" />
        <span className="text-xs text-zinc-500">Thinking…</span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
      {visible.map((step, i) => {
        const isRunning = step.status === "running";
        const isLast = i === visible.length - 1;
        const isExpanded = expandedIdx === i;

        return (
          <div key={i} className={i < visible.length - 1 ? "border-b border-zinc-800/60" : ""}>
            <button
              onClick={step.expandable ? () => setExpandedIdx(isExpanded ? null : i) : undefined}
              className={`group w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors
                ${step.expandable ? "hover:bg-zinc-800/50 cursor-pointer" : "cursor-default"}`}
            >
              <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
                {isRunning ? (
                  <Spinner className="text-blue-400" />
                ) : (
                  <CheckIcon className="text-zinc-600" />
                )}
              </span>

              {step.icon !== "thinking" && (
                <StepIcon type={step.icon} className={isRunning ? "text-zinc-300" : "text-zinc-600"} />
              )}

              <span className={`text-xs flex-1 ${isRunning ? "text-zinc-200 font-medium" : "text-zinc-500"}`}>
                {step.label}
              </span>

              {step.expandable && step.detail && (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  className={`text-zinc-600 flex-shrink-0 transition-transform duration-150 ${isExpanded ? "rotate-180" : ""}`}>
                  <path d="M6 9l6 6 6-6" />
                </svg>
              )}
            </button>

            {isExpanded && step.detail && (
              <div className="border-t border-zinc-800/60 bg-zinc-950">
                <div className="flex items-center justify-between px-4 py-1.5 border-b border-zinc-800/40">
                  <span className="text-zinc-600 text-[10px] uppercase tracking-wider font-medium">
                    {step.icon === "thought" ? "Reasoning" : "SQL"}
                  </span>
                  {step.icon !== "thought" && <CopyButton text={step.detail} />}
                </div>
                <pre className="px-4 py-3 text-xs text-zinc-300 font-mono whitespace-pre-wrap overflow-x-auto leading-relaxed">
                  {step.detail.trim()}
                </pre>
              </div>
            )}
          </div>
        );
      })}

      {/* Footer shown when all visible steps are done but agent is still working */}
      {lastIsDone && (
        <div className="border-t border-zinc-800/60 px-4 py-2.5 flex items-center gap-2.5">
          <Spinner className="text-zinc-600" />
          <span className="text-xs text-zinc-600">Working…</span>
        </div>
      )}
    </div>
  );
}

// ─── Frozen trace (shown on completed messages) ───────────────────────────────

function FrozenTrace({ steps }: { steps: AgentStep[] }) {
  const [expanded, setExpanded] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  function stepLabel(step: AgentStep): string {
    switch (step.type) {
      case "thought":        return "Reasoning";
      case "reading_file":   return `Read ${step.path.split("/").pop()}`;
      case "listing_files":  return "Listed entity files";
      case "listing_tables": return "Fetched table list";
      case "getting_schema": return `Schema: ${step.table}`;
      case "query":
        return step.error ? "Query failed" : `Query · ${step.rows} row${step.rows !== 1 ? "s" : ""}`;
      case "memory_update":
        return "Saved to memory";
    }
  }

  function stepDetail(step: AgentStep): string | undefined {
    if (step.type === "thought") return step.text;
    if (step.type === "query") return step.sql;
    return undefined;
  }

  function isExpandable(step: AgentStep) {
    return step.type === "thought" || step.type === "query";
  }

  const queryCount = steps.filter((s) => s.type === "query").length;
  const summary = queryCount > 0
    ? `${steps.length} step${steps.length !== 1 ? "s" : ""} · ${queryCount} quer${queryCount !== 1 ? "ies" : "y"}`
    : `${steps.length} step${steps.length !== 1 ? "s" : ""}`;

  return (
    <div className="mb-1">
      {/* Collapsed toggle */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="group flex items-center gap-2 px-1 py-1 rounded-md hover:bg-zinc-800/40 transition-colors cursor-pointer"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className={`text-zinc-600 transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}>
          <path d="M9 18l6-6-6-6" />
        </svg>
        <span className="text-[11px] text-zinc-600 group-hover:text-zinc-500 transition-colors font-medium">
          {summary}
        </span>
      </button>

      {expanded && (
        <div className="mt-1 ml-1 space-y-0.5">
          {steps.map((step, i) => {
            const detail = stepDetail(step);
            const canExpand = isExpandable(step) && !!detail;
            const isError = step.type === "query" && step.error;
            const isExpanded = expandedIdx === i;
            const isLast = i === steps.length - 1;

            return (
              <div key={i}>
                <button
                  onClick={canExpand ? () => setExpandedIdx(isExpanded ? null : i) : undefined}
                  className={`group w-full flex items-center gap-3 px-3 py-1.5 rounded-lg text-left transition-colors
                    ${canExpand ? "hover:bg-zinc-800/30 cursor-pointer" : "cursor-default"}`}
                >
                  <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                    {isError ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-red-500">
                        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                    ) : (
                      <CheckIcon className="text-zinc-700" />
                    )}
                  </span>

                  <StepIcon type={step.type} className={isError ? "text-red-500" : "text-zinc-700"} />

                  <span className={`text-xs flex-1 ${isError ? "text-red-400" : "text-zinc-600"}`}>
                    {stepLabel(step)}
                  </span>

                  {canExpand && (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                      className={`text-zinc-700 flex-shrink-0 transition-transform duration-150 ${isExpanded ? "rotate-180" : ""}`}>
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  )}
                </button>

                {isExpanded && (
                  <div className="mx-3 mb-1 rounded-lg overflow-hidden border border-zinc-800/60 bg-zinc-950">
                    {step.type === "thought" ? (
                      <>
                        <div className="flex items-center px-3 py-1.5 border-b border-zinc-800/60 bg-zinc-900/40">
                          <span className="text-zinc-700 text-[10px] uppercase tracking-wider font-medium">Reasoning</span>
                        </div>
                        <pre className="px-3 py-2.5 text-xs text-zinc-500 font-mono whitespace-pre-wrap overflow-x-auto leading-relaxed">
                          {step.text.trim()}
                        </pre>
                      </>
                    ) : step.type === "query" ? (
                      <>
                        <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-800/60 bg-zinc-900/40">
                          <span className="text-zinc-700 text-[10px] uppercase tracking-wider font-medium">SQL</span>
                          <CopyButton text={step.sql} />
                        </div>
                        <pre className="px-3 py-2.5 text-xs text-zinc-500 font-mono whitespace-pre-wrap overflow-x-auto leading-relaxed">
                          {step.sql.trim()}
                        </pre>
                        {step.preview && step.preview.length > 0 && step.schema && (
                          <QueryPreview rows={step.preview} schema={step.schema} totalRows={step.rows} />
                        )}
                      </>
                    ) : null}
                  </div>
                )}

                {!isLast && (
                  <div className="ml-[22px] w-px h-1 bg-zinc-800/50" />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

function MarkdownMessage({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => <h1 className="text-base font-semibold text-zinc-100 mt-3 mb-1 first:mt-0">{children}</h1>,
        h2: ({ children }) => <h2 className="text-sm font-semibold text-zinc-100 mt-3 mb-1 first:mt-0">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-semibold text-zinc-200 mt-2 mb-1 first:mt-0">{children}</h3>,
        p:  ({ children }) => <p className="text-sm text-zinc-200 leading-relaxed mb-2 last:mb-0">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold text-zinc-100">{children}</strong>,
        em:     ({ children }) => <em className="italic text-zinc-300">{children}</em>,
        code: ({ children, className }) => {
          if (className) {
            return <code className="block bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-zinc-300 overflow-x-auto my-2 whitespace-pre">{children}</code>;
          }
          return <code className="bg-zinc-800 text-zinc-300 rounded px-1 py-0.5 text-xs font-mono">{children}</code>;
        },
        pre:  ({ children }) => <>{children}</>,
        hr:   () => <hr className="border-zinc-700 my-3" />,
        ul:   ({ children }) => <ul className="list-disc list-inside text-sm text-zinc-300 space-y-0.5 mb-2 last:mb-0 pl-2">{children}</ul>,
        ol:   ({ children }) => <ol className="list-decimal list-inside text-sm text-zinc-300 space-y-0.5 mb-2 last:mb-0 pl-2">{children}</ol>,
        li:   ({ children }) => <li className="text-zinc-300">{children}</li>,
        table: ({ children }) => (
          <div className="overflow-x-auto my-3 rounded-lg border border-zinc-700">
            <table className="w-full text-sm border-collapse">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-zinc-800">{children}</thead>,
        tbody: ({ children }) => <tbody className="divide-y divide-zinc-700/50">{children}</tbody>,
        tr:    ({ children }) => <tr className="hover:bg-zinc-800/40 transition-colors">{children}</tr>,
        th:    ({ children }) => <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-400 uppercase tracking-wider whitespace-nowrap">{children}</th>,
        td:    ({ children }) => <td className="px-4 py-2.5 text-zinc-300 text-sm">{children}</td>,
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

// ─── Memory panel ─────────────────────────────────────────────────────────────

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
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-[480px] bg-zinc-950 border-l border-zinc-800 z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="text-zinc-400">
              <path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z" />
              <path d="M12 8v4l3 3" />
            </svg>
            <span className="text-sm font-medium text-zinc-200">App Memory</span>
          </div>
          <button onClick={onClose} className="text-zinc-600 hover:text-zinc-400 transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Description */}
        <div className="px-5 py-3 border-b border-zinc-800/60 flex-shrink-0">
          <p className="text-xs text-zinc-500 leading-relaxed">
            Schema facts shared across all users and datasets of this app.
            Claude reads this before every query and updates it when it learns something new.
            Keep it focused on column types, enum values, and non-obvious join patterns.
          </p>
        </div>

        {/* Editor */}
        <div className="flex-1 overflow-hidden flex flex-col p-4 gap-3">
          {loadState === "loading" ? (
            <div className="flex-1 flex items-center justify-center">
              <Spinner className="text-zinc-600" />
            </div>
          ) : (
            <textarea
              value={content}
              onChange={(e) => { setContent(e.target.value); if (loadState === "saved") setLoadState("ready"); }}
              placeholder={`## table_name\n- Column facts, enum values, non-obvious patterns\n\n## another_table\n- ...`}
              className="flex-1 w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-xs text-zinc-300 font-mono placeholder:text-zinc-700 focus:outline-none focus:border-zinc-600 transition-colors resize-none leading-relaxed"
              spellCheck={false}
            />
          )}

          <div className="flex items-center justify-between flex-shrink-0">
            <span className="text-[11px] text-zinc-700">
              {content.length > 0 ? `${content.split("\n").length} lines` : "Empty"}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="text-xs text-zinc-500 hover:text-zinc-300 px-3 py-1.5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={loadState === "loading" || loadState === "saving"}
                className="flex items-center gap-1.5 text-xs bg-zinc-100 text-zinc-900 hover:bg-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40 font-medium"
              >
                {loadState === "saving" && <Spinner className="text-zinc-600 w-3 h-3" />}
                {loadState === "saved" ? (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                    Saved
                  </>
                ) : loadState === "saving" ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

