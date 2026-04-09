import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAppAuth, getAdminAuth, ok, err } from "@/lib/api";

// GET /api/apps/[id] — fetch app details, datasets, files, and members
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAppAuth(params.id);
  if (!auth.ok) return auth.response;

  const [{ data: app }, { data: datasets }, { data: files }, { data: members }] =
    await Promise.all([
      supabase.from("apps").select("*").eq("id", params.id).single(),
      supabase.from("app_datasets").select("*").eq("app_id", params.id).order("created_at"),
      supabase.from("app_files").select("id, file_path, category, created_at").eq("app_id", params.id).order("file_path"),
      supabase.from("app_members").select("user_id, created_at, users(id, email, name, role)").eq("app_id", params.id),
    ]);

  if (!app) return err("App not found", 404);
  return ok({ app, datasets, files, members });
}

// DELETE /api/apps/[id] — delete app and all its storage files (admin/superadmin only)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAdminAuth();
  if (!auth.ok) return auth.response;

  const { data: files } = await supabase
    .from("app_files")
    .select("storage_path")
    .eq("app_id", params.id);

  if (files?.length) {
    await supabase.storage.from("entity-files").remove(files.map((f) => f.storage_path));
  }

  const { error } = await supabase.from("apps").delete().eq("id", params.id);
  if (error) return err(error.message, 500);
  return ok({ ok: true });
}
