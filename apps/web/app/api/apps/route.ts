import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

// GET /api/apps — list apps accessible to the current user
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: user } = await supabase
    .from("users")
    .select("id, role")
    .eq("email", session.user!.email!)
    .single();

  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  let query = supabase
    .from("apps")
    .select("id, name, description, created_at")
    .order("created_at", { ascending: false });

  // Admins and superadmins see all apps; members see only their assigned apps
  if (user.role === "member") {
    const { data: memberships } = await supabase
      .from("app_members")
      .select("app_id")
      .eq("user_id", user.id);

    const appIds = (memberships ?? []).map((m) => m.app_id);
    if (appIds.length === 0) return NextResponse.json({ apps: [] });

    query = query.in("id", appIds);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ apps: data });
}

// POST /api/apps — create a new app (admin/superadmin only)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!["admin", "superadmin"].includes(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { name, description } = (await req.json()) as {
    name: string;
    description?: string;
  };

  if (!name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("email", session.user!.email!)
    .single();

  const { data, error } = await supabase
    .from("apps")
    .insert({ name: name.trim(), description: description?.trim() ?? null, created_by: user?.id })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ app: data }, { status: 201 });
}
