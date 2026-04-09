import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAppAuth, ok, err } from "@/lib/api";
import { readAppMemory } from "@/lib/agent/runner";

const MEMORY_BUCKET = "entity-files";
const memoryPath = (appId: string) => `${appId}/__memory__.md`;

// GET /api/apps/[id]/memory — fetch the app's memory document
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAppAuth(params.id);
  if (!auth.ok) return auth.response;

  const memory = await readAppMemory(params.id);
  return ok({ content: memory ?? "" });
}

// PUT /api/apps/[id]/memory — save (or delete) the app's memory document
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAppAuth(params.id);
  if (!auth.ok) return auth.response;

  const { content } = (await req.json()) as { content: string };
  if (content === undefined) return err("content is required", 400);

  if (!content.trim()) {
    // Empty content → remove the file entirely
    await supabase.storage.from(MEMORY_BUCKET).remove([memoryPath(params.id)]);
    return ok({ ok: true });
  }

  await supabase.storage
    .from(MEMORY_BUCKET)
    .upload(memoryPath(params.id), new Blob([content], { type: "text/markdown" }), {
      upsert: true,
    });

  return ok({ ok: true });
}
