import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAuth, getAdminAuth, ok, err } from "@/lib/api";

// GET /api/apps — list apps accessible to the current user
export async function GET() {
  const auth = await getAuth();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  let query = supabase
    .from("apps")
    .select("id, name, description, created_at")
    .order("created_at", { ascending: false });

  // Members only see apps they've been explicitly added to
  if (user.role === "member") {
    const { data: memberships } = await supabase
      .from("app_members")
      .select("app_id")
      .eq("user_id", user.id);

    const appIds = (memberships ?? []).map((m) => m.app_id);
    if (appIds.length === 0) return ok({ apps: [] });
    query = query.in("id", appIds);
  }

  const { data, error } = await query;
  if (error) return err(error.message, 500);
  return ok({ apps: data });
}

// POST /api/apps — create a new app (admin/superadmin only)
export async function POST(req: NextRequest) {
  const auth = await getAdminAuth();
  if (!auth.ok) return auth.response;

  const { name, description } = (await req.json()) as {
    name: string;
    description?: string;
  };

  if (!name?.trim()) return err("name is required", 400);

  const { data, error } = await supabase
    .from("apps")
    .insert({
      name: name.trim(),
      description: description?.trim() ?? null,
      created_by: auth.user.id,
    })
    .select()
    .single();

  if (error) return err(error.message, 500);
  return ok({ app: data }, 201);
}
