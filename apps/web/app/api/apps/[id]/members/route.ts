import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAuth, getAdminAuth, ok, err } from "@/lib/api";

// GET /api/apps/[id]/members — list members of an app
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuth();
  if (!auth.ok) return auth.response;

  const { data, error } = await supabase
    .from("app_members")
    .select("user_id, created_at, users(id, email, name, role)")
    .eq("app_id", params.id);

  if (error) return err(error.message, 500);
  return ok({ members: data });
}

// POST /api/apps/[id]/members — add a user to an app (admin/superadmin only)
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAdminAuth();
  if (!auth.ok) return auth.response;

  const { user_id } = (await req.json()) as { user_id: string };
  if (!user_id) return err("user_id is required", 400);

  const { error } = await supabase
    .from("app_members")
    .insert({ app_id: params.id, user_id });

  if (error) return err(error.message, 500);
  return ok({ ok: true }, 201);
}
