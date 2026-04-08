import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { Sandbox } from "e2b";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { repoUrl } = (await req.json()) as { repoUrl: string };
  if (!repoUrl?.trim()) {
    return NextResponse.json({ error: "repoUrl is required" }, { status: 400 });
  }

  // Fetch user's GitHub token from Supabase
  const { data: user, error: dbError } = await supabase
    .from("users")
    .select("github_access_token")
    .eq("email", session.user!.email!)
    .single();

  if (dbError) {
    console.error("[e2b/launch] Supabase query failed:", dbError);
    return NextResponse.json(
      { error: "Failed to fetch user data" },
      { status: 500 }
    );
  }

  if (!user?.github_access_token) {
    console.error("[e2b/launch] No GitHub token for", session.user!.email);
    return NextResponse.json(
      { error: "GitHub account not connected" },
      { status: 400 }
    );
  }

  // Build authenticated clone URL
  // Input: https://github.com/org/repo  or  git@github.com:org/repo.git
  const cloneUrl = buildCloneUrl(repoUrl, user.github_access_token);
  if (!cloneUrl) {
    return NextResponse.json({ error: "Invalid GitHub repo URL" }, { status: 400 });
  }

  let sandbox: Sandbox | null = null;
  try {
    console.log("[e2b/launch] Creating sandbox...");
    sandbox = await Sandbox.create({ apiKey: process.env.E2B_API_KEY! });
    console.log("[e2b/launch] Sandbox created:", sandbox.sandboxId);

    const repoPath = "/home/user/repo";

    console.log("[e2b/launch] Cloning repo...");
    await sandbox.git.clone(cloneUrl, { path: repoPath, depth: 1 });

    const log = await sandbox.commands.run(
      `git -C ${repoPath} log -1 --format="%H"`
    );

    const commitId = log.stdout.trim();
    console.log("[e2b/launch] Success, commit:", commitId);
    return NextResponse.json({ commitId });
  } catch (err) {
    console.error("[e2b/launch] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "E2B error" },
      { status: 500 }
    );
  } finally {
    await sandbox?.kill();
  }
}

function buildCloneUrl(repoUrl: string, token: string): string | null {
  try {
    // Normalise SSH urls: git@github.com:org/repo.git → https://github.com/org/repo.git
    const normalised = repoUrl
      .trim()
      .replace(/^git@github\.com:/, "https://github.com/")
      .replace(/\.git$/, "");

    const url = new URL(normalised);
    if (url.hostname !== "github.com") return null;

    return `https://oauth2:${token}@github.com${url.pathname}.git`;
  } catch {
    return null;
  }
}
