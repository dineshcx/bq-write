import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";
import { readAppMemory } from "@/lib/agent/runner";

const MEMORY_BUCKET = "entity-files";
const memoryPath = (appId: string) => `${appId}/__memory__.md`;

async function checkAccess(appId: string, email: string) {
  const { data: user } = await supabase
    .from("users")
    .select("id, role")
    .eq("email", email)
    .single();

  if (!user) return null;

  if (user.role === "member") {
    const { data: membership } = await supabase
      .from("app_members")
      .select("app_id")
      .eq("app_id", appId)
      .eq("user_id", user.id)
      .single();
    if (!membership) return null;
  }

  return user;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await checkAccess(params.id, session.user!.email!);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const memory = await readAppMemory(params.id);
  return NextResponse.json({ content: memory ?? "" });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await checkAccess(params.id, session.user!.email!);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { content } = (await req.json()) as { content: string };

  if (content === undefined) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  if (!content.trim()) {
    // Empty content → delete the file
    await supabase.storage.from(MEMORY_BUCKET).remove([memoryPath(params.id)]);
    return NextResponse.json({ ok: true });
  }

  await supabase.storage
    .from(MEMORY_BUCKET)
    .upload(memoryPath(params.id), new Blob([content], { type: "text/markdown" }), { upsert: true });

  return NextResponse.json({ ok: true });
}
