import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAdminAuth, ok, err } from "@/lib/api";

// DELETE /api/apps/[id]/datasets/[datasetId] — remove a dataset (admin/superadmin only)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; datasetId: string } }
) {
  const auth = await getAdminAuth();
  if (!auth.ok) return auth.response;

  const { error } = await supabase
    .from("app_datasets")
    .delete()
    .eq("id", params.datasetId)
    .eq("app_id", params.id);

  if (error) return err(error.message, 500);
  return ok({ ok: true });
}
