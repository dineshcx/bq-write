"use client";
import { useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { DbAppDataset } from "@/lib/supabase";
import type { Message, AgentStep } from "@/lib/agent/runner";

interface AppInfo {
  id: string;
  name: string;
  description: string | null;
}

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  clarification?: string;
  steps?: AgentStep[];
}

const PROGRESS_LABELS: Record<string, (e: Record<string, string>) => string> = {
  thinking:       () => "Thinking...",
  listing_files:  () => "Exploring entity files...",
  reading_file:   (e) => `Reading ${e.path?.split("/").pop()}`,
  listing_tables: () => "Fetching table list...",
  getting_schema: (e) => `Fetching schema for ${e.table}...`,
  running_query:  () => "Running query...",
  query_done:     (e) => `Query returned ${e.rows} row(s)`,
};

export default function AppQueryPage({ params }: { params: { id: string } }) {
  const { data: session, status } = useSession();
  const [app, setApp] = useState<AppInfo | null>(null);
  const [datasets, setDatasets] = useState<DbAppDataset[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [history, setHistory] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [thinking, setThinking] = useState(false);
  const [progressLabel, setProgressLabel] = useState<string>("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch(`/api/apps/${params.id}`)
      .then((r) => r.json())
      .then((d) => {
        setApp(d.app);
        setDatasets(d.datasets ?? []);
        if (d.datasets?.length > 0) setSelectedDatasetId(d.datasets[0].id);
      })
      .finally(() => setLoading(false));
  }, [status, params.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat, thinking, progressLabel]);

  async function sendQuestion(q: string) {
    if (!q.trim() || !selectedDatasetId || thinking) return;

    setChat((prev) => [...prev, { role: "user", text: q }]);
    setQuestion("");
    setThinking(true);
    setProgressLabel("Thinking...");

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
          try {
            event = JSON.parse(line.slice(6));
          } catch {
            continue;
          }

          const labelFn = PROGRESS_LABELS[event.type as string];
          if (labelFn) {
            setProgressLabel(labelFn(event as Record<string, string>));
          }

          if (event.type === "done") {
            setHistory((event.history as Message[]) ?? []);
            setChat((prev) => [...prev, { role: "assistant", text: event.answer as string, steps: (event.steps as AgentStep[]) ?? [] }]);
            setThinking(false);
            setProgressLabel("");
          } else if (event.type === "clarification") {
            setHistory((event.history as Message[]) ?? []);
            setChat((prev) => [...prev, { role: "assistant", text: "", clarification: event.question as string, steps: (event.steps as AgentStep[]) ?? [] }]);
            setThinking(false);
            setProgressLabel("");
          } else if (event.type === "error") {
            setChat((prev) => [...prev, { role: "assistant", text: `Error: ${event.message}` }]);
            setThinking(false);
            setProgressLabel("");
          }
        }
      }
    } catch (err) {
      setChat((prev) => [...prev, { role: "assistant", text: `Error: ${err instanceof Error ? err.message : "Request failed"}` }]);
      setThinking(false);
      setProgressLabel("");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendQuestion(question);
    }
  }

  if (status === "loading" || loading) return <LoadingScreen />;
  if (!session) return <AccessDenied message="You must be signed in." />;
  if (!app) return <AccessDenied message="App not found or access denied." />;

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
              onChange={(e) => {
                setSelectedDatasetId(e.target.value);
                setChat([]);
                setHistory([]);
              }}
              className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm text-zinc-300 focus:outline-none focus:border-zinc-600 transition-colors"
            >
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </select>
          )}
          {datasets.length === 1 && selectedDataset && (
            <span className="text-xs text-zinc-500 bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1">
              {selectedDataset.label}
            </span>
          )}
          <span className="text-zinc-500 text-sm">{session.user?.email}</span>
        </div>
      </header>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {chat.length === 0 && (
            <div className="text-center pt-12">
              <p className="text-zinc-400 text-sm">Ask a question about your data.</p>
              {selectedDataset && (
                <p className="text-zinc-600 text-xs mt-1">
                  {selectedDataset.gcp_project_id}.{selectedDataset.dataset_id}
                </p>
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
                <div className="max-w-2xl space-y-1.5">
                  {msg.clarification ? (
                    <div className="rounded-2xl rounded-bl-sm border border-yellow-900 bg-yellow-950/20 px-4 py-3">
                      <p className="text-xs text-yellow-500 uppercase tracking-wider mb-1">Clarification needed</p>
                      <p className="text-sm text-zinc-200">{msg.clarification}</p>
                    </div>
                  ) : (
                    <div className="rounded-2xl rounded-bl-sm bg-zinc-900 border border-zinc-800 px-4 py-3">
                      <MarkdownMessage text={msg.text} />
                    </div>
                  )}
                  {msg.steps && msg.steps.length > 0 && (
                    <StepsTrace steps={msg.steps} />
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Thinking indicator with live progress */}
          {thinking && (
            <div className="flex justify-start">
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl rounded-bl-sm px-4 py-3 space-y-2">
                <div className="flex gap-1 items-center">
                  <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:300ms]" />
                </div>
                {progressLabel && (
                  <p className="text-xs text-zinc-500 font-mono">{progressLabel}</p>
                )}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
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

function MarkdownMessage({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Headings
        h1: ({ children }) => <h1 className="text-base font-semibold text-zinc-100 mt-3 mb-1 first:mt-0">{children}</h1>,
        h2: ({ children }) => <h2 className="text-sm font-semibold text-zinc-100 mt-3 mb-1 first:mt-0">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-semibold text-zinc-200 mt-2 mb-1 first:mt-0">{children}</h3>,
        // Paragraph
        p: ({ children }) => <p className="text-sm text-zinc-200 leading-relaxed mb-2 last:mb-0">{children}</p>,
        // Bold / italic
        strong: ({ children }) => <strong className="font-semibold text-zinc-100">{children}</strong>,
        em: ({ children }) => <em className="italic text-zinc-300">{children}</em>,
        // Inline code
        code: ({ children, className }) => {
          const isBlock = !!className;
          if (isBlock) {
            return (
              <code className="block bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-zinc-300 overflow-x-auto my-2 whitespace-pre">
                {children}
              </code>
            );
          }
          return <code className="bg-zinc-800 text-zinc-300 rounded px-1 py-0.5 text-xs font-mono">{children}</code>;
        },
        pre: ({ children }) => <>{children}</>,
        // Horizontal rule
        hr: () => <hr className="border-zinc-700 my-3" />,
        // Lists
        ul: ({ children }) => <ul className="list-disc list-inside text-sm text-zinc-300 space-y-0.5 mb-2 last:mb-0 pl-2">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal list-inside text-sm text-zinc-300 space-y-0.5 mb-2 last:mb-0 pl-2">{children}</ol>,
        li: ({ children }) => <li className="text-zinc-300">{children}</li>,
        // Table
        table: ({ children }) => (
          <div className="overflow-x-auto my-3 rounded-lg border border-zinc-700">
            <table className="w-full text-sm border-collapse">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-zinc-800">{children}</thead>,
        tbody: ({ children }) => <tbody className="divide-y divide-zinc-700/50">{children}</tbody>,
        tr: ({ children }) => <tr className="hover:bg-zinc-800/40 transition-colors">{children}</tr>,
        th: ({ children }) => (
          <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-400 uppercase tracking-wider whitespace-nowrap">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="px-4 py-2.5 text-zinc-300 text-sm">{children}</td>
        ),
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

function StepsTrace({ steps }: { steps: AgentStep[] }) {
  const [open, setOpen] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const queryCount = steps.filter((s) => s.type === "query").length;
  const label = `${steps.length} step${steps.length !== 1 ? "s" : ""}${queryCount > 0 ? ` · ${queryCount} quer${queryCount !== 1 ? "ies" : "y"}` : ""}`;

  return (
    <div className="pl-1 mt-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className={`transition-transform duration-150 ${open ? "rotate-90" : ""}`}>
          <path d="M9 18l6-6-6-6" />
        </svg>
        {label}
      </button>

      {open && (
        <div className="mt-3 ml-1 border-l border-zinc-800 pl-4 space-y-2">
          {steps.map((step, i) => (
            <StepRow key={i} step={step} index={i} expanded={expandedIdx === i} onToggle={() => setExpandedIdx(expandedIdx === i ? null : i)} />
          ))}
        </div>
      )}
    </div>
  );
}

function StepRow({ step, index, expanded, onToggle }: { step: AgentStep; index: number; expanded: boolean; onToggle: () => void }) {
  const isExpandable = step.type === "query" || step.type === "thought";

  const icon = {
    thought:       "💭",
    reading_file:  "📄",
    listing_files: "📂",
    listing_tables:"📋",
    getting_schema:"🔍",
    query:         "⚡",
  }[step.type] ?? "•";

  function label() {
    switch (step.type) {
      case "thought":        return "Agent reasoning";
      case "reading_file":   return `Read ${step.path.split("/").pop()}`;
      case "listing_files":  return "Listed entity files";
      case "listing_tables": return "Fetched table list";
      case "getting_schema": return `Got schema for ${step.table}`;
      case "query":
        return step.error
          ? `Query failed`
          : `Query → ${step.rows} row${step.rows !== 1 ? "s" : ""}`;
    }
  }

  return (
    <div>
      <button
        onClick={isExpandable ? onToggle : undefined}
        className={`flex items-center gap-2 w-full text-left group ${isExpandable ? "cursor-pointer" : "cursor-default"}`}
      >
        <span className="text-sm w-4 flex-shrink-0">{icon}</span>
        <span className={`text-xs flex-1 ${
          step.type === "query" && step.error
            ? "text-red-400"
            : step.type === "thought"
            ? "text-zinc-500 italic"
            : "text-zinc-400"
        }`}>
          {label()}
        </span>
        {isExpandable && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className={`text-zinc-700 flex-shrink-0 transition-transform duration-150 ${expanded ? "rotate-180" : ""}`}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        )}
      </button>

      {expanded && isExpandable && (
        <div className="mt-1.5 ml-6 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5 overflow-x-auto">
          {step.type === "thought" && (
            <p className="text-xs text-zinc-400 leading-relaxed whitespace-pre-wrap">{step.text}</p>
          )}
          {step.type === "query" && (
            <pre className="text-xs text-zinc-400 font-mono whitespace-pre">{step.sql.trim()}</pre>
          )}
        </div>
      )}
    </div>
  );
}

function LoadingScreen() {
  return <div className="flex items-center justify-center min-h-screen"><span className="text-zinc-500 text-sm">Loading...</span></div>;
}
function AccessDenied({ message }: { message: string }) {
  return <div className="flex items-center justify-center min-h-screen"><p className="text-zinc-500 text-sm">{message}</p></div>;
}
