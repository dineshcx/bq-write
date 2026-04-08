"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { LoadingScreen } from "@/components/auth-guards";
import { useAuth } from "@/lib/auth-context";

export default function LaunchPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <LaunchContent />
    </Suspense>
  );
}

function LaunchContent() {
  const session = useAuth();
  const searchParams = useSearchParams();

  const [githubConnected, setGithubConnected] = useState<boolean | null>(null);
  const [repoUrl, setRepoUrl] = useState("");
  const [result, setResult] = useState<{ commitId?: string; error?: string } | null>(null);
  const [launching, setLaunching] = useState(false);

  // Check GitHub connection status on load
  useEffect(() => {
    const githubParam = searchParams.get("github");
    if (githubParam === "connected") {
      setGithubConnected(true);
      window.history.replaceState({}, "", "/launch");
      return;
    }
    if (githubParam === "error") {
      setGithubConnected(false);
      window.history.replaceState({}, "", "/launch");
      return;
    }

    // Check if already connected
    fetch("/api/github/status")
      .then((r) => r.json())
      .then((d) => setGithubConnected(d.connected))
      .catch(() => setGithubConnected(false));
  }, [status, searchParams]);

  async function handleLaunch() {
    if (!repoUrl.trim()) return;
    setLaunching(true);
    setResult(null);
    try {
      const res = await fetch("/api/e2b/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl }),
      });
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setResult({ error: err instanceof Error ? err.message : "Request failed" });
    } finally {
      setLaunching(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-zinc-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-sm">bq-write</span>
          <span className="text-zinc-600 text-sm">/</span>
          <span className="text-zinc-400 text-sm">Launch</span>
        </div>
        <span className="text-zinc-400 text-sm">{session.user?.email}</span>
      </header>

      <main className="flex-1 flex items-start justify-center pt-20 px-6">
        <div className="w-full max-w-lg space-y-6">
          <div className="space-y-1">
            <h2 className="font-semibold">Launch repo sandbox</h2>
            <p className="text-zinc-400 text-sm">
              Clone a private GitHub repo into a sandboxed environment.
            </p>
          </div>

          {/* GitHub connection status */}
          <div className="flex items-center justify-between rounded-lg border border-zinc-800 px-4 py-3">
            <div className="flex items-center gap-2">
              <GitHubIcon />
              <span className="text-sm text-zinc-300">GitHub</span>
              {githubConnected === null && (
                <span className="text-xs text-zinc-500">Checking...</span>
              )}
              {githubConnected === true && (
                <span className="text-xs text-green-400">Connected</span>
              )}
              {githubConnected === false && (
                <span className="text-xs text-zinc-500">Not connected</span>
              )}
            </div>
            {githubConnected !== true && (
              <a
                href="/api/github/connect"
                className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3 py-1.5 rounded-md transition-colors"
              >
                Connect
              </a>
            )}
            {githubConnected === true && (
              <a
                href="/api/github/connect"
                className="text-xs text-zinc-500 hover:text-zinc-400 transition-colors"
              >
                Reconnect
              </a>
            )}
          </div>

          {/* Repo URL input */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs text-zinc-400 uppercase tracking-wider">
                GitHub repo URL
              </label>
              <input
                type="text"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/org/repo"
                disabled={!githubConnected}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              />
            </div>

            <button
              onClick={handleLaunch}
              disabled={!githubConnected || !repoUrl.trim() || launching}
              className="w-full bg-zinc-100 text-zinc-900 font-medium text-sm px-4 py-2.5 rounded-lg hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {launching ? (
                <span className="flex items-center justify-center gap-2">
                  <Spinner /> Cloning repo...
                </span>
              ) : (
                "Launch"
              )}
            </button>
          </div>

          {/* Result */}
          {result && (
            <div
              className={`rounded-lg border p-4 space-y-2 ${
                result.error
                  ? "border-red-900 bg-red-950/30"
                  : "border-green-900 bg-green-950/30"
              }`}
            >
              {result.error ? (
                <>
                  <p className="text-red-400 text-sm font-medium">Failed</p>
                  <p className="text-red-300 text-sm font-mono break-all">{result.error}</p>
                </>
              ) : (
                <>
                  <p className="text-green-400 text-sm font-medium">Cloned successfully</p>
                  <div className="space-y-1">
                    <p className="text-zinc-400 text-xs uppercase tracking-wider">Latest commit</p>
                    <p className="text-zinc-200 text-sm font-mono break-all">{result.commitId}</p>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-zinc-300">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.73.083-.73 1.205.085 1.84 1.237 1.84 1.237 1.07 1.835 2.807 1.305 3.492.998.108-.776.418-1.305.762-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.468-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23A11.52 11.52 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.29-1.552 3.297-1.23 3.297-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.807 5.625-5.48 5.92.43.37.823 1.102.823 2.222 0 1.606-.015 2.896-.015 3.286 0 .322.216.694.825.576C20.565 21.796 24 17.298 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}
