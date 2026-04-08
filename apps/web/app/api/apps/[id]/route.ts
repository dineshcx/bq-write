import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

// GET /api/apps/[id] — get app details + datasets + files list
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: user } = await supabase
    .from("users")
    .select("id, role")
    .eq("email", session.user!.email!)
    .single();

  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Check access
  if (user.role === "member") {
    const { data: membership } = await supabase
      .from("app_members")
      .select("app_id")
      .eq("app_id", params.id)
      .eq("user_id", user.id)
      .single();

    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [{ data: app }, { data: datasets }, { data: files }, { data: members }] =
    await Promise.all([
      supabase.from("apps").select("*").eq("id", params.id).single(),
      supabase
        .from("app_datasets")
        .select("*")
        .eq("app_id", params.id)
        .order("created_at"),
      supabase
        .from("app_files")
        .select("id, file_path, category, created_at")
        .eq("app_id", params.id)
        .order("file_path"),
      supabase
        .from("app_members")
        .select("user_id, created_at, users(id, email, name, role)")
        .eq("app_id", params.id),
    ]);

  if (!app) return NextResponse.json({ error: "App not found" }, { status: 404 });

  return NextResponse.json({ app, datasets, files, members });
}

// DELETE /api/apps/[id] — delete app (admin/superadmin only)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!["admin", "superadmin"].includes(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Delete storage files first
  const { data: files } = await supabase
    .from("app_files")
    .select("storage_path")
    .eq("app_id", params.id);

  if (files && files.length > 0) {
    await supabase.storage
      .from("entity-files")
      .remove(files.map((f) => f.storage_path));
  }

  const { error } = await supabase.from("apps").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
