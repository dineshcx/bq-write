import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAuth, getAdminAuth, ok, err } from "@/lib/api";

// GET /api/apps/[id]/datasets — list datasets for an app
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuth();
  if (!auth.ok) return auth.response;

  const { data, error } = await supabase
    .from("app_datasets")
    .select("*")
    .eq("app_id", params.id)
    .order("created_at");

  if (error) return err(error.message, 500);
  return ok({ datasets: data });
}

// POST /api/apps/[id]/datasets — add a BigQuery dataset (admin/superadmin only)
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAdminAuth();
  if (!auth.ok) return auth.response;

  const { label, gcp_project_id, dataset_id } = (await req.json()) as {
    label: string;
    gcp_project_id: string;
    dataset_id: string;
  };

  if (!label?.trim() || !gcp_project_id?.trim() || !dataset_id?.trim()) {
    return err("label, gcp_project_id, and dataset_id are required", 400);
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

  if (error) return err(error.message, 500);
  return ok({ dataset: data }, 201);
}
