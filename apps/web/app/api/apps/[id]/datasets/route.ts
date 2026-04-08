import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("app_datasets")
    .select("*")
    .eq("app_id", params.id)
    .order("created_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ datasets: data });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!["admin", "superadmin"].includes(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { label, gcp_project_id, dataset_id } = (await req.json()) as {
    label: string;
    gcp_project_id: string;
    dataset_id: string;
  };

  if (!label?.trim() || !gcp_project_id?.trim() || !dataset_id?.trim()) {
    return NextResponse.json(
      { error: "label, gcp_project_id, and dataset_id are required" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("app_datasets")
    .insert({
      app_id: params.id,
      label: label.trim(),
      gcp_project_id: gcp_project_id.trim(),
      dataset_id: dataset_id.trim(),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ dataset: data }, { status: 201 });
}
